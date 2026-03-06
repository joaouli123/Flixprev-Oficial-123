import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const userA = '07d16581-fca5-4709-b0d3-e09859dbb286';
const userB = '11111111-1111-4111-8111-111111111111';

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const agent = await client.query(
      "SELECT id, title FROM agents WHERE lower(title) = lower('Agente DirTrab') LIMIT 1"
    );

    if (agent.rowCount === 0) {
      throw new Error('Agente DirTrab não encontrado para teste.');
    }

    const agentId = agent.rows[0].id;

    const convA = await client.query(
      'INSERT INTO conversations (agent_id, title, user_id) VALUES ($1, $2, $3) RETURNING id',
      [agentId, 'Teste Persistência A', userA]
    );

    const convB = await client.query(
      'INSERT INTO conversations (agent_id, title, user_id) VALUES ($1, $2, $3) RETURNING id',
      [agentId, 'Teste Persistência B', userB]
    );

    await client.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [convA.rows[0].id, 'user', 'Mensagem de teste usuário A']
    );

    await client.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [convA.rows[0].id, 'assistant', 'Resposta de teste A']
    );

    await client.query(
      'INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)',
      [convB.rows[0].id, 'user', 'Mensagem de teste usuário B']
    );

    const listA = await client.query(
      'SELECT id, user_id, agent_id, title FROM conversations WHERE user_id = $1 ORDER BY id DESC LIMIT 5',
      [userA]
    );

    const listB = await client.query(
      'SELECT id, user_id, agent_id, title FROM conversations WHERE user_id = $1 ORDER BY id DESC LIMIT 5',
      [userB]
    );

    const msgA = await client.query(
      'SELECT COUNT(*)::int AS c FROM messages WHERE conversation_id = $1',
      [convA.rows[0].id]
    );

    const msgB = await client.query(
      'SELECT COUNT(*)::int AS c FROM messages WHERE conversation_id = $1',
      [convB.rows[0].id]
    );

    await client.query('ROLLBACK');

    console.log(
      JSON.stringify(
        {
          success: true,
          sampleAgentId: agentId,
          userAConversationsFound: listA.rowCount,
          userBConversationsFound: listB.rowCount,
          messagesInConvA: msgA.rows[0].c,
          messagesInConvB: msgB.rows[0].c,
          isolationCheck: listA.rows.every((r) => r.user_id === userA) && listB.rows.every((r) => r.user_id === userB),
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('CHAT_VALIDATION_ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
