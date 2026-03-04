import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage, pool } from "./storage";
import fs from "fs";
import path from "path";
// @ts-ignore
import pdf from "pdf-parse";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const AI_INPUT_COST_PER_1K = Number(process.env.AI_INPUT_COST_PER_1K || 0.005);
const AI_OUTPUT_COST_PER_1K = Number(process.env.AI_OUTPUT_COST_PER_1K || 0.015);

async function extractFileContent(filePath: string): Promise<string> {
  try {
    const fullPath = path.join(process.cwd(), "public", filePath);
    console.log(`[CHAT] Attempting to read file: ${fullPath}`);
    if (!fs.existsSync(fullPath)) {
      console.warn(`[CHAT] File not found: ${fullPath}`);
      return "";
    }

    const dataBuffer = fs.readFileSync(fullPath);
    if (filePath.toLowerCase().endsWith(".pdf")) {
      console.log(`[CHAT] Parsing PDF: ${filePath} using pdf-parse`);
      const data = await (pdf as any)(dataBuffer);
      const text = data.text || "";
      console.log(`[CHAT] PDF parsed successfully. Text length: ${text.length}`);
      if (text.length < 50) {
        console.warn(`[CHAT] WARNING: Extracted text is very short (${text.length} chars). PDF might be scanned/image-only.`);
      }
      return text;
    } else {
      const text = dataBuffer.toString("utf-8");
      console.log(`[CHAT] Text file read. Length: ${text.length}`);
      return text;
    }
  } catch (error) {
    console.error(`[CHAT] Error extracting content from ${filePath}:`, error);
    return "";
  }
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || "").length / 4));
}

function estimateCostUsd(promptTokens: number, completionTokens: number): number {
  const input = (promptTokens / 1000) * AI_INPUT_COST_PER_1K;
  const output = (completionTokens / 1000) * AI_OUTPUT_COST_PER_1K;
  return Number((input + output).toFixed(6));
}

async function ensureAiUsageTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ai_request_logs (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT,
      conversation_id INTEGER,
      request_type TEXT NOT NULL DEFAULT 'chat_completion',
      model TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd NUMERIC(12,6) NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ai_request_logs_created_at
    ON ai_request_logs(created_at DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_ai_request_logs_user_id
    ON ai_request_logs(user_id, created_at DESC);
  `);
}

async function logAiUsage(params: {
  userId?: string;
  conversationId?: number;
  model?: string;
  status: "success" | "error";
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  errorMessage?: string;
}) {
  await ensureAiUsageTable();

  await pool.query(
    `
    INSERT INTO ai_request_logs (
      user_id,
      conversation_id,
      request_type,
      model,
      status,
      prompt_tokens,
      completion_tokens,
      total_tokens,
      cost_usd,
      error_message
    )
    VALUES ($1, $2, 'chat_completion', $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      (params.userId || "").trim() || null,
      Number.isFinite(params.conversationId) ? params.conversationId : null,
      params.model || "gpt-4o",
      params.status,
      Math.max(0, Math.floor(params.promptTokens || 0)),
      Math.max(0, Math.floor(params.completionTokens || 0)),
      Math.max(0, Math.floor(params.totalTokens || 0)),
      Number(params.costUsd || 0),
      params.errorMessage || null,
    ]
  );
}

export function registerChatRoutes(app: Express): void {
  console.log('[CHAT] Registering chat routes...');

  app.get("/api/admin/ai-usage", async (req: Request, res: Response) => {
    try {
      const requesterId = (req.header("x-user-id") || "").trim();
      if (!requesterId) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      const adminCheck = await pool.query(
        'SELECT role FROM profiles WHERE id::text = $1 LIMIT 1',
        [requesterId]
      );

      if ((adminCheck.rows[0]?.role || "").toLowerCase() !== "admin") {
        return res.status(403).json({ error: "Acesso negado" });
      }

      const requestedDays = Number(req.query.days);
      const rangeDays = Number.isFinite(requestedDays)
        ? Math.min(Math.max(Math.floor(requestedDays), 1), 365)
        : 30;

      await ensureAiUsageTable();
      await pool.query('ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id TEXT');

      const summaryQuery = await pool.query(
        `
        SELECT
          COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN total_tokens ELSE 0 END), 0)::int AS tokens_today,
          COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN cost_usd ELSE 0 END), 0)::numeric(12,6) AS cost_today,
          COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN total_tokens ELSE 0 END), 0)::int AS tokens_month,
          COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN cost_usd ELSE 0 END), 0)::numeric(12,6) AS cost_month,
          COALESCE(COUNT(*) FILTER (WHERE created_at >= NOW() - ($1 || ' days')::interval), 0)::int AS requests,
          COALESCE(COUNT(*) FILTER (WHERE created_at >= NOW() - ($1 || ' days')::interval AND status = 'error'), 0)::int AS errors,
          COALESCE(SUM(total_tokens) FILTER (WHERE created_at >= NOW() - ($1 || ' days')::interval), 0)::int AS total_tokens_range,
          COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= NOW() - ($1 || ' days')::interval), 0)::numeric(12,6) AS total_cost_range
        FROM ai_request_logs
        `,
        [rangeDays]
      );

      const usersQuery = await pool.query(
        `
        SELECT
          COALESCE(l.user_id, 'desconhecido') AS user_id,
          COALESCE(
            NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
            NULLIF(u.nome_completo, ''),
            NULLIF(u.email, ''),
            l.user_id,
            'Sem identificação'
          ) AS nome,
          COALESCE(NULLIF(u.email, ''), '—') AS email,
          COUNT(*)::int AS requests,
          COALESCE(SUM(l.total_tokens), 0)::int AS total_tokens,
          COALESCE(SUM(l.cost_usd), 0)::numeric(12,6) AS total_cost_usd,
          MAX(l.created_at) AS ultima_atividade
        FROM ai_request_logs l
        LEFT JOIN profiles p ON p.id::text = l.user_id
        LEFT JOIN usuarios u ON u.user_id = l.user_id
        WHERE l.created_at >= NOW() - ($1 || ' days')::interval
        GROUP BY l.user_id, p.first_name, p.last_name, u.nome_completo, u.email
        ORDER BY total_tokens DESC
        LIMIT 200
        `,
        [rangeDays]
      );

      const requestsQuery = await pool.query(
        `
        SELECT
          l.id,
          l.created_at,
          COALESCE(
            NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
            NULLIF(u.email, ''),
            l.user_id,
            'Sem identificação'
          ) AS usuario,
          l.request_type AS tipo,
          l.total_tokens AS tokens,
          l.cost_usd,
          l.status
        FROM ai_request_logs l
        LEFT JOIN profiles p ON p.id::text = l.user_id
        LEFT JOIN usuarios u ON u.user_id = l.user_id
        WHERE l.created_at >= NOW() - ($1 || ' days')::interval
        ORDER BY l.created_at DESC
        LIMIT 50
        `,
        [rangeDays]
      );

      const summaryRow = summaryQuery.rows[0] || {};
      const requests = Number(summaryRow.requests || 0);
      const errors = Number(summaryRow.errors || 0);
      const errorRate = requests > 0 ? Number(((errors / requests) * 100).toFixed(2)) : 0;

      return res.json({
        range_days: rangeDays,
        summary: {
          tokens_today: Number(summaryRow.tokens_today || 0),
          cost_today: Number(summaryRow.cost_today || 0),
          requests,
          errors,
          error_rate: errorRate,
          tokens_month: Number(summaryRow.tokens_month || 0),
          cost_month: Number(summaryRow.cost_month || 0),
          total_tokens_range: Number(summaryRow.total_tokens_range || 0),
          total_cost_range: Number(summaryRow.total_cost_range || 0),
        },
        by_user: usersQuery.rows || [],
        requests: requestsQuery.rows || [],
      });
    } catch (error: any) {
      console.error("[AI USAGE] Error:", error);
      return res.status(500).json({ error: error.message || "Erro ao carregar consumo de IA" });
    }
  });
  
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
    const { agentId } = req.query;
    const userId = (req.header("x-user-id") || "").trim();
    console.log('[CHAT API] GET /api/conversations', agentId ? `for agent ${agentId}` : '');
    try {
      let conversations;
      // Sempre tentamos buscar do banco primeiro, filtrando por agent_id se fornecido
      try {
        let query = 'SELECT * FROM conversations';
        const whereClauses: string[] = [];
        const params: any[] = [];
        if (agentId) {
          whereClauses.push(`agent_id = $${params.length + 1}`);
          params.push(agentId);
        }
        if (userId) {
          whereClauses.push(`user_id = $${params.length + 1}`);
          params.push(userId);
        }
        if (whereClauses.length > 0) {
          query += ` WHERE ${whereClauses.join(' AND ')}`;
        }
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, params);
        conversations = result.rows;
      } catch (dbErr) {
        console.warn('[CHAT API] DB query failed, falling back to storage helper:', dbErr);
        conversations = await chatStorage.getAllConversations();
      }
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get single conversation with messages
  app.get("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await chatStorage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const messages = await chatStorage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // Create new conversation
  app.post("/api/conversations", async (req: Request, res: Response) => {
    try {
      const { title, agentId, userId: bodyUserId } = req.body;
      const headerUserId = (req.header("x-user-id") || "").trim();
      const userId = (bodyUserId || headerUserId || "").toString().trim();
      console.log('[CHAT API] Creating conversation with title:', title, 'agentId:', agentId);
      
      // Armazenamos o agentId no título ou em metadados se a tabela suportar
      // Por enquanto, vamos garantir que o título reflita o agente
      const conversation = await chatStorage.createConversation(title || "New Chat");
      
      // Se tivermos agentId, podemos vincular a conversa ao agente na tabela se ela existir
      // Verificando se a tabela conversations tem a coluna agent_id
      try {
        await pool.query('ALTER TABLE conversations ADD COLUMN IF NOT EXISTS agent_id TEXT');
        await pool.query('ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id TEXT');
        if (agentId) {
          await pool.query('UPDATE conversations SET agent_id = $1 WHERE id = $2', [agentId, conversation.id]);
          conversation.agent_id = agentId;
        }
        if (userId) {
          await pool.query('UPDATE conversations SET user_id = $1 WHERE id = $2', [userId, conversation.id]);
          conversation.user_id = userId;
        }
      } catch (e) {
        console.warn('[CHAT] Could not update agent_id in conversation:', e);
      }

      console.log('[CHAT API] Created conversation:', conversation);
      res.status(201).json(conversation);
    } catch (error: any) {
      console.error('[CHAT API] Error creating conversation:', error.message);
      res.status(500).json({ error: "Failed to create conversation: " + error.message });
    }
  });

  // Update conversation title
  app.patch("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title } = req.body;
      
      console.log(`[PATCH /api/conversations/${id}] Tentando renomear para:`, title);

      if (!title || (typeof title !== 'string') || title.trim() === "") {
        return res.status(400).json({ error: "Título não pode ser vazio" });
      }
      
      const trimmedTitle = title.trim();
      const numericId = parseInt(id);
      
      // Tentativa 1: Update direto com ID como fornecido (pode ser string no banco)
      let result = await pool.query(
        'UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id::text = $2 RETURNING *',
        [trimmedTitle, id]
      );
      
      // Tentativa 2: Se falhar e for numérico, tentar como inteiro
      if (result.rows.length === 0 && !isNaN(numericId)) {
        console.log(`[CHAT API] Tentativa 2: UPDATE com ID numérico ${numericId}`);
        result = await pool.query(
          'UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
          [trimmedTitle, numericId]
        );
      }
      
      if (result.rows.length === 0) {
        // Fallback para memória
        const conversation = await chatStorage.getConversation(!isNaN(numericId) ? numericId : -1);
        if (conversation) {
          conversation.title = trimmedTitle;
          conversation.updated_at = new Date().toISOString();
          console.log(`[CHAT API] Updated in-memory conversation ${id}`);
          return res.json(conversation);
        }
        
        console.error(`[CHAT API] Conversa ${id} não encontrada em NENHUM lugar`);
        return res.status(404).json({ error: "Conversa não encontrada" });
      }
      
      console.log(`[CHAT API] Sucesso ao renomear ${id}`);
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Error updating conversation:", error);
      res.status(500).json({ error: "Erro interno: " + error.message });
    }
  });

  // LIMPAR TODAS AS CONVERSAS E MENSAGENS
  app.post("/api/conversations/clear-all", async (req: Request, res: Response) => {
    try {
      console.log('[API] Limpando todas as conversas e mensagens...');
      await pool.query('DELETE FROM messages');
      await pool.query('DELETE FROM conversations');
      console.log('[API] Limpeza concluída com sucesso');
      res.json({ success: true, message: 'Todas as conversas foram excluídas' });
    } catch (e: any) {
      console.error('[API ERROR] Falha ao limpar conversas:', e);
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Delete conversation
  app.delete("/api/conversations/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await chatStorage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming)
  app.post("/api/conversations/:id/messages", async (req: Request, res: Response) => {
    console.log('[CHAT API] POST /api/conversations/:id/messages');
    try {
      const conversationId = parseInt(req.params.id);
      const { content, agentId: bodyAgentId } = req.body;
      const userId = (req.header("x-user-id") || "").trim();
      
      // Tentar pegar agentId de várias formas
      const agentId = bodyAgentId || req.query.agentId || req.params.agentId;

      console.log(`[CHAT] Message for conv ${conversationId}. agentId: ${agentId}`);

      // Fetch agent context
      let systemPrompt = "Você é um assistente prestativo especializado em advocacia previdenciária.";
      if (agentId) {
        try {
          const agentResult = await pool.query('SELECT * FROM "agents" WHERE "id" = $1', [agentId]);
          const agent = agentResult.rows[0];
          if (agent) {
            const inst = agent.instructions || agent.description || "Sem instruções específicas.";
            
            // Extract content from attachments
            let attachmentsContent = "";
            if (agent.attachments && Array.isArray(agent.attachments) && agent.attachments.length > 0) {
              console.log(`[CHAT] Reading ${agent.attachments.length} attachments for agent ${agent.title}`);
              for (const attachment of agent.attachments) {
                // Remove leading slash if present
                const normalizedPath = attachment.startsWith('/') ? attachment.substring(1) : attachment;
                
                // TENTATIVA 1: Usar o caminho original do banco de dados (que pode estar com encoding incorreto)
                console.log(`[CHAT] Attempt 1: ${normalizedPath}`);
                let text = await extractFileContent(normalizedPath);
                
                // TENTATIVA 2: Se falhar, tentar decodificar (para casos de espaços/acentos normais)
                if (!text) {
                  const decodedPath = decodeURIComponent(normalizedPath);
                  if (decodedPath !== normalizedPath) {
                    console.log(`[CHAT] Attempt 2 (decoded): ${decodedPath}`);
                    text = await extractFileContent(decodedPath);
                  }
                }
                
                // TENTATIVA 3: Se ainda falhar, tentar normalizar caracteres que costumam dar problema em nomes de arquivo via upload
                if (!text) {
                  // O log mostra "Ana LÃdia", o que sugere um problema de UTF-8 -> ISO-8859-1
                  // Vamos tentar substituir padrões comuns de encoding corrompido
                  const fixedPath = normalizedPath
                    .replace(/Ã­/g, 'í')
                    .replace(/Ã¡/g, 'á')
                    .replace(/Ã©/g, 'é')
                    .replace(/Ã³/g, 'ó')
                    .replace(/Ãº/g, 'ú')
                    .replace(/Ã±/g, 'ñ')
                    .replace(/Ã /g, 'à')
                    .replace(/Ã£/g, 'ã')
                    .replace(/Ãµ/g, 'õ')
                    .replace(/Ã¢/g, 'â')
                    .replace(/Ãª/g, 'ê')
                    .replace(/Ã´/g, 'ô');
                  
                  if (fixedPath !== normalizedPath) {
                    console.log(`[CHAT] Attempt 3 (fixed encoding): ${fixedPath}`);
                    text = await extractFileContent(fixedPath);
                  }
                }

                if (text) {
                  console.log(`[CHAT] Content extracted successfully, length: ${text.length}`);
                  attachmentsContent += `\n\n--- CONTEÚDO DO ARQUIVO (${attachment}) ---\n${text}\n--- FIM DO CONTEÚDO ---`;
                } else {
                  console.warn(`[CHAT] Failed to read attachment after all attempts: ${attachment}`);
                }
              }
            }

            systemPrompt = `Você é o assistente: ${agent.title}.

INSTRUÇÕES DO AGENTE:
${inst}

BASE DE CONHECIMENTO OBRIGATÓRIA (CONTEÚDO DOS DOCUMENTOS ANEXADOS):
${attachmentsContent || "AVISO: Nenhum documento anexado foi encontrado ou lido com sucesso."}

DIRETRIZES DE RESPOSTA (RAG):
1. Use PRIORITARIAMENTE o conteúdo da BASE DE CONHECIMENTO acima.
2. Se a pergunta do usuário for respondida pelos documentos, use as informações deles.
3. Cite autores e conceitos específicos presentes nos textos (ex: Ensslin, Yokominzo, Whiteley).
4. Se a informação NÃO estiver nos documentos, responda EXATAMENTE: "Não encontrei essa informação nos documentos deste agente.".
5. Nunca use conhecimento externo, suposições, memória do modelo ou informações genéricas fora dos documentos.`;
            
            console.log(`[CHAT] Context loaded for agent: ${agent.title} with attachments content length: ${attachmentsContent.length}`);
          } else {
            console.warn(`[CHAT] Agent with ID ${agentId} not found in database.`);
          }
        } catch (dbError: any) {
          console.error("[CHAT DB ERROR]", dbError.message);
        }
      } else {
        console.warn("[CHAT] No agentId provided in the request.");
      }

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      if (userId) {
        try {
          await pool.query('ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id TEXT');
          await pool.query('UPDATE conversations SET user_id = COALESCE(user_id, $1) WHERE id = $2', [userId, conversationId]);
        } catch (syncUserErr) {
          console.warn('[CHAT] Could not sync user_id into conversation:', syncUserErr);
        }
      }

      // Get history AFTER saving user message but BEFORE AI response
      const history = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = [
        { role: "system", content: systemPrompt },
        ...history.map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      ];

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if ((res as any).flushHeaders) (res as any).flushHeaders();

      const promptContent = chatMessages.map((message: any) => String(message?.content || "")).join("\n");
      const estimatedPromptTokens = estimateTokens(promptContent);
      let completionModel = "gpt-4o";

      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: chatMessages as any,
          stream: true,
          stream_options: { include_usage: true } as any,
        });

        let fullResponse = "";
        let finalUsage: any = null;
        for await (const chunk of stream) {
          if ((chunk as any)?.usage) {
            finalUsage = (chunk as any).usage;
          }

          if ((chunk as any)?.model) {
            completionModel = (chunk as any).model;
          }

          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponse += delta;
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        }

        console.log(`[CHAT] AI stream finished for conv ${conversationId}. Saving response...`);
        try {
          const savedAssistantMsg = await chatStorage.createMessage(conversationId, "assistant", fullResponse);
          console.log(`[CHAT] Assistant message saved in storage with ID: ${savedAssistantMsg?.id}`);
          
          // Confirmar que foi salvo no DB
          const check = await pool.query('SELECT * FROM messages WHERE id = $1', [savedAssistantMsg.id]);
          if (check.rows.length === 0) {
            console.error(`[CHAT] 🚨 FATAL: Mensagem ID ${savedAssistantMsg.id} NÃO encontrada no DB após salvar!`);
          }

          const promptTokens = Number(finalUsage?.prompt_tokens || estimatedPromptTokens || 0);
          const completionTokens = Number(finalUsage?.completion_tokens || estimateTokens(fullResponse) || 0);
          const totalTokens = Number(finalUsage?.total_tokens || (promptTokens + completionTokens));
          const costUsd = estimateCostUsd(promptTokens, completionTokens);

          await logAiUsage({
            userId,
            conversationId,
            model: completionModel,
            status: "success",
            promptTokens,
            completionTokens,
            totalTokens,
            costUsd,
          });
        } catch (saveErr) {
          console.error(`[CHAT] 🚨 Erro crítico ao salvar no DB:`, saveErr);
        }
        
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (streamError: any) {
        console.error("[STREAM ERROR]", streamError.message);
        try {
          const completionTokens = 0;
          const promptTokens = estimatedPromptTokens;
          await logAiUsage({
            userId,
            conversationId,
            model: completionModel,
            status: "error",
            promptTokens,
            completionTokens,
            totalTokens: promptTokens,
            costUsd: estimateCostUsd(promptTokens, completionTokens),
            errorMessage: streamError.message,
          });
        } catch (usageError) {
          console.warn('[CHAT] Could not persist AI usage log on error:', usageError);
        }

        if (res.headersSent) {
          res.write(`data: ${JSON.stringify({ error: `AI Error: ${streamError.message}` })}\n\n`);
          res.end();
        } else {
          res.status(500).json({ error: streamError.message });
        }
      }
    } catch (error: any) {
      console.error("[CHAT ERROR]", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Failed to send message" });
      }
    }
  });
}

