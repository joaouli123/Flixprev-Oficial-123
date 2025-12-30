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

export function registerChatRoutes(app: Express): void {
  console.log('[CHAT] Registering chat routes...');
  
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
    const { agentId } = req.query;
    console.log('[CHAT API] GET /api/conversations', agentId ? `for agent ${agentId}` : '');
    try {
      let conversations;
      if (agentId) {
        try {
          const result = await pool.query('SELECT * FROM conversations WHERE agent_id = $1 ORDER BY created_at DESC', [agentId]);
          conversations = result.rows;
        } catch (e) {
          // Fallback if column doesn't exist yet
          conversations = await chatStorage.getAllConversations();
        }
      } else {
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
      const { title, agentId } = req.body;
      console.log('[CHAT API] Creating conversation with title:', title, 'agentId:', agentId);
      
      // Armazenamos o agentId no título ou em metadados se a tabela suportar
      // Por enquanto, vamos garantir que o título reflita o agente
      const conversation = await chatStorage.createConversation(title || "New Chat");
      
      // Se tivermos agentId, podemos vincular a conversa ao agente na tabela se ela existir
      // Verificando se a tabela conversations tem a coluna agent_id
      try {
        await pool.query('ALTER TABLE conversations ADD COLUMN IF NOT EXISTS agent_id TEXT');
        if (agentId) {
          await pool.query('UPDATE conversations SET agent_id = $1 WHERE id = $2', [agentId, conversation.id]);
          conversation.agent_id = agentId;
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
      const id = parseInt(req.params.id);
      const { title } = req.body;
      
      console.log(`[PATCH /api/conversations/${id}] title:`, title);

      if (!title || (typeof title !== 'string') || title.trim() === "") {
        return res.status(400).json({ error: "Título não pode ser vazio" });
      }
      
      // Update in DB
      const result = await pool.query(
        'UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [title.trim(), id]
      );
      
      if (result.rows.length === 0) {
        // Fallback for in-memory or if record not found in DB
        const conversation = await chatStorage.getConversation(id);
        if (conversation) {
          conversation.title = title.trim();
          conversation.updated_at = new Date().toISOString();
          console.log(`[CHAT API] Updated in-memory conversation ${id}`);
          return res.json(conversation);
        }
        return res.status(404).json({ error: "Conversa não encontrada" });
      }
      
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Error updating conversation:", error);
      res.status(500).json({ error: "Falha ao atualizar conversa: " + error.message });
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
4. Se a informação não estiver nos documentos, você pode usar seu conhecimento geral, mas deve priorizar os fatos dos arquivos.`;
            
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

      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-4o", 
          messages: chatMessages as any,
          stream: true,
        });

        let fullResponse = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponse += delta;
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        }

        console.log(`[CHAT] AI stream finished for conv ${conversationId}. Saving response...`);
        const savedAssistantMsg = await chatStorage.createMessage(conversationId, "assistant", fullResponse);
        console.log(`[CHAT] Assistant message saved in storage with ID: ${savedAssistantMsg?.id}`);
        
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (streamError: any) {
        console.error("[STREAM ERROR]", streamError.message);
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

