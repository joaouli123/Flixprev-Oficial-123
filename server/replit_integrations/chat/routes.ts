import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage, pool } from "./storage";
import fs from "fs";
import path from "path";
import pdf from "pdf-parse";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function extractFileContent(filePath: string): Promise<string> {
  try {
    const fullPath = path.join(process.cwd(), "public", filePath);
    if (!fs.existsSync(fullPath)) return "";

    const dataBuffer = fs.readFileSync(fullPath);
    if (filePath.toLowerCase().endsWith(".pdf")) {
      const data = await pdf(dataBuffer);
      return data.text;
    } else {
      return dataBuffer.toString("utf-8");
    }
  } catch (error) {
    console.error(`Error extracting content from ${filePath}:`, error);
    return "";
  }
}

export function registerChatRoutes(app: Express): void {
  console.log('[CHAT] Registering chat routes...');
  
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
    console.log('[CHAT API] GET /api/conversations');
    try {
      const conversations = await chatStorage.getAllConversations();
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
      const { title } = req.body;
      console.log('[CHAT API] Creating conversation with title:', title);
      const conversation = await chatStorage.createConversation(title || "New Chat");
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
      
      if (!title || title.trim() === "") {
        return res.status(400).json({ error: "Title cannot be empty" });
      }
      
      const result = await pool.query(
        'UPDATE conversations SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [title, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Error updating conversation:", error);
      res.status(500).json({ error: "Failed to update conversation" });
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
      const { content, agentId } = req.body;

      console.log(`[CHAT] Message for conv ${conversationId}: ${content}`);

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
                const text = await extractFileContent(attachment);
                if (text) {
                  attachmentsContent += `\n\n--- CONTEÚDO DO ARQUIVO (${attachment}) ---\n${text}\n--- FIM DO ARQUIVO ---`;
                }
              }
            }

            systemPrompt = `Você é o assistente: ${agent.title}. 
            
INSTRUÇÕES DO AGENTE:
${inst}

CONTEÚDO DOS DOCUMENTOS ANEXADOS (PRIORIDADE):
${attachmentsContent || "Nenhum documento anexado."}

IMPORTANTE: Use o conteúdo dos documentos anexados acima como sua principal fonte de conhecimento. Se a informação estiver nos documentos, priorize-a sobre o seu conhecimento geral.`;
            
            console.log(`[CHAT] Context loaded for agent: ${agent.title} with attachments content length: ${attachmentsContent.length}`);
          }
        } catch (dbError: any) {
          console.error("[CHAT DB ERROR]", dbError.message);
        }
      }

      // Save user message
      await chatStorage.createMessage(conversationId, "user", content);

      // Get history
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

        await chatStorage.createMessage(conversationId, "assistant", fullResponse);
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

