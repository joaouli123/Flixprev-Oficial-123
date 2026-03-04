import { Router, Request, Response } from "express";
import { Pool } from "pg";

const router = Router();

const dbUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString: dbUrl });

function normalizeCode(raw: string): string {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
}

async function ensureReferralCode(userId: string): Promise<string> {
  const existing = await pool.query(
    `SELECT code FROM referral_codes WHERE user_id = $1 LIMIT 1`,
    [userId]
  );

  if (existing.rows[0]?.code) {
    return existing.rows[0].code;
  }

  const generated = await pool.query(`SELECT ensure_referral_code($1) AS code`, [userId]);
  return generated.rows[0]?.code;
}

router.get("/referrals/me", async (req: Request, res: Response) => {
  try {
    const userId = (req.header("x-user-id") || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    const code = await ensureReferralCode(userId);

    const summaryResult = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_indicacoes,
        COALESCE(SUM(credit_units), 0)::int AS total_creditos,
        COALESCE(SUM(comissao_valor), 0)::numeric(12,2) AS total_comissao
      FROM referral_histories
      WHERE referrer_user_id = $1
        AND status = 'confirmado'
      `,
      [userId]
    );

    const historyResult = await pool.query(
      `
      SELECT
        rh.id,
        rh.referral_code,
        rh.referred_user_id,
        rh.referred_email,
        rh.plan,
        rh.status,
        rh.credit_units,
        rh.valor_compra,
        rh.comissao_percent,
        rh.comissao_valor,
        rh.created_at,
        COALESCE(NULLIF(u.nome_completo, ''), NULLIF(u.email, ''), rh.referred_email, 'Usuário indicado') AS indicado_nome
      FROM referral_histories rh
      LEFT JOIN usuarios u ON u.user_id = rh.referred_user_id
      WHERE rh.referrer_user_id = $1
      ORDER BY rh.created_at DESC
      LIMIT 200
      `,
      [userId]
    );

    const appUrl = process.env.APP_BASE_URL || "https://www.assertivemind.com.br";
    const referralUrl = `${appUrl.replace(/\/$/, "")}/?ref=${encodeURIComponent(code)}`;

    return res.json({
      code,
      referral_url: referralUrl,
      summary: summaryResult.rows[0] || {
        total_indicacoes: 0,
        total_creditos: 0,
        total_comissao: 0,
      },
      history: historyResult.rows || [],
    });
  } catch (error: any) {
    console.error("[REFERRALS] /referrals/me error:", error);
    return res.status(500).json({ error: error.message || "Erro ao carregar indicações" });
  }
});

router.get("/referrals/by-code/:code", async (req: Request, res: Response) => {
  try {
    const code = normalizeCode(req.params.code || "");
    if (!code) {
      return res.status(400).json({ valid: false, error: "Código inválido" });
    }

    const result = await pool.query(
      `
      SELECT
        rc.code,
        rc.user_id,
        COALESCE(NULLIF(u.nome_completo, ''), NULLIF(u.email, ''), 'Indicador') AS nome
      FROM referral_codes rc
      LEFT JOIN usuarios u ON u.user_id = rc.user_id
      WHERE rc.code = $1
        AND rc.is_active = true
      LIMIT 1
      `,
      [code]
    );

    if (!result.rows[0]) {
      return res.json({ valid: false });
    }

    return res.json({ valid: true, ...result.rows[0] });
  } catch (error: any) {
    console.error("[REFERRALS] /referrals/by-code error:", error);
    return res.status(500).json({ error: error.message || "Erro ao validar código" });
  }
});

export default router;
