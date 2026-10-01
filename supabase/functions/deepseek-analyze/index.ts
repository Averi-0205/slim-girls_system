import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': [
    'authorization',
    'x-client-info',
    'apikey',
    'content-type',
    'x-supabase-api-version',
    'x-supabase-client-platform',
    'x-supabase-client-platform-version',
    'x-supabase-client-runtime',
    'x-supabase-client-runtime-version'
  ].join(', '),
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type AnalysisAction = 'daily-summary' | 'cost-analysis' | 'food-image';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function buildMessages(action: AnalysisAction, data: unknown) {
  const context = JSON.stringify(data ?? {}).slice(0, 16000);

  if (action === 'food-image') {
    const imageDataUrl = String((data as { imageDataUrl?: string } | null)?.imageDataUrl || '');
    return [
      {
        role: 'system',
        content: [
          '你是食物照片热量估算助手。',
          '只根据图片内容估算，不确定时降低置信度，不得编造品牌或精确成分。',
          '只返回合法 JSON，不要使用 Markdown 代码块。',
          'JSON 格式：{"foods":[{"name":"食物名称","portion":"预估分量","kcal":数字}],"totalKcal":数字,"proteinG":数字,"carbsG":数字,"fatG":数字,"description":"简短说明"}'
        ].join('')
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '请识别这张食物照片，估算每种食物及总热量。若画面中没有明显食物，foods 返回空数组并说明原因。'
          },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUrl,
              detail: 'low'
            }
          }
        ]
      }
    ];
  }

  if (action === 'cost-analysis') {
    return [
      {
        role: 'system',
        content: [
          '你是严谨的减脂与消费数据分析助手。',
          '只根据用户提供的数据总结趋势，不得编造数据，不得把相关性直接描述为因果关系。',
          '使用中文，输出两到三段，语言简洁、可执行。',
          '不进行医学诊断；涉及健康风险时建议咨询专业人士。'
        ].join('')
      },
      {
        role: 'user',
        content: `请分析以下体重与饮食消费汇总数据，指出趋势、异常点和可执行建议：\n${context}`
      }
    ];
  }

  return [
    {
      role: 'system',
      content: [
        '你是严谨的减脂数据助手。',
        '只根据用户提供的饮食、运动、体重和习惯数据总结，不得编造缺失信息。',
        '使用中文，输出两到三段，给出具体但不过度激进的建议。',
        '不进行医学诊断；涉及健康风险时建议咨询专业人士。'
      ].join('')
    },
    {
      role: 'user',
      content: `请生成今日减脂小结，包含摄入、运动、热量缺口和建议：\n${context}`
    }
  ];
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'Missing authorization' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const deepSeekApiKey = Deno.env.get('DEEPSEEK_API_KEY');
  const model = Deno.env.get('DEEPSEEK_MODEL') || 'deepseek-flash';

  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Supabase function environment is incomplete' }, 500);
  }
  if (!deepSeekApiKey) {
    return jsonResponse({ error: 'DEEPSEEK_API_KEY is not configured' }, 503);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData.user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body: { action?: AnalysisAction; data?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const action: AnalysisAction = body.action === 'cost-analysis'
    ? 'cost-analysis'
    : body.action === 'food-image'
      ? 'food-image'
      : 'daily-summary';
  const requestId = crypto.randomUUID();

  try {
    const deepSeekResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepSeekApiKey}`
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(action, body.data),
        thinking: { type: 'disabled' },
        temperature: action === 'cost-analysis' ? 0.35 : 0.4,
        max_tokens: 1200,
        stream: false,
        ...(action === 'food-image' ? { response_format: { type: 'json_object' } } : {})
      })
    });

    const result = await deepSeekResponse.json();
    if (!deepSeekResponse.ok) {
      console.error('DeepSeek API error', {
        requestId,
        status: deepSeekResponse.status,
        code: result?.error?.code,
        message: result?.error?.message
      });
      return jsonResponse({
        error: result?.error?.message || 'DeepSeek request failed',
        requestId
      }, 502);
    }

    const message = result?.choices?.[0]?.message;
    const text = String(message?.content || message?.reasoning_content || '').trim();
    if (!text) {
      return jsonResponse({ error: 'DeepSeek returned an empty response', requestId }, 502);
    }

    return jsonResponse({
      text,
      model: result?.model || model,
      requestId,
      usage: result?.usage || null
    });
  } catch (error) {
    console.error('DeepSeek function error', { requestId, error: String(error) });
    return jsonResponse({ error: 'DeepSeek request failed', requestId }, 502);
  }
});
