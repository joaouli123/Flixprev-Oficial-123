import type { Express, Request, Response } from "express";
import OpenAI from "openai";
import { chatStorage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export function registerChatRoutes(app: Express): void {
  // Get all conversations
  app.get("/api/conversations", async (req: Request, res: Response) => {
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
      const conversation = await chatStorage.createConversation(title || "New Chat");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
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
    try {
      const conversationId = parseInt(req.params.id);
      const { content, agentId } = req.body;

      console.log(`Received message for conversation ${conversationId}: ${content}`);

      // Fetch agent info if agentId is provided
      let systemPrompt = "Você é um assistente prestativo.";
      if (agentId) {
        try {
          // Verify table name for agents. Based on the codebase it might be 'agentes'
          const agentResult = await pool.query('SELECT * FROM "agentes" WHERE "id" = $1', [agentId]);
          const agent = agentResult.rows[0];
          if (agent) {
            systemPrompt = `Você é o assistente: ${agent.title}. 
Instruções: ${agent.instructions || "Sem instruções específicas."}
Base de conhecimento: ${agent.description || "Sem descrição adicional."}`;
          }
        } catch (dbError: any) {
          console.error("Error fetching agent context:", dbError.message);
        }
      }

      // Save user message
      try {
        await chatStorage.createMessage(conversationId, "user", content);
      } catch (e: any) {
        console.error(`[DB ERROR] User message insertion failed:`, e.message);
        return res.status(500).json({ error: "Erro ao salvar mensagem no banco de dados." });
      }

      // Get conversation history for context
      const messages = await chatStorage.getMessagesByConversation(conversationId);
      const chatMessages = [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      ];

      // Set up SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      if ((res as any).flushHeaders) (res as any).flushHeaders();

      // Stream response from OpenAI
      console.log(`[STREAMING] Initiating OpenAI completion for conv ${conversationId}`);
      try {
        const stream = await openai.chat.completions.create({
          model: "gpt-4o", 
          messages: chatMessages as any,
          stream: true,
        });

        console.log(`[STREAMING] Stream started for conversation ${conversationId}`);

        let fullResponse = "";

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            fullResponse += delta;
            res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
          }
        }

        console.log(`[STREAMING] Stream finished for conversation ${conversationId}`);

        // Save assistant message
        await chatStorage.createMessage(conversationId, "assistant", fullResponse);

        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      } catch (streamError: any) {
        console.error("[STREAMING ERROR]", streamError);
        throw streamError;
      }
    } catch (error: any) {
      console.error("Error sending message:", error);
      // Check if headers already sent (SSE streaming started)
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: error.message || "Failed to send message" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: error.message || "Failed to send message" });
      }
    }
  });
}

