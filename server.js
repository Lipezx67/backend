const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Config (via .env) ──
const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BOT_TOKEN     = process.env.BOT_TOKEN;
const ROLE_ID       = process.env.ROLE_ID;
const REDIRECT_URI  = process.env.REDIRECT_URI; // ex: https://oauthbot.netlify.app/

app.use(express.json());

// ── CORS (permite o frontend chamar o backend) ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── Rota principal: recebe o ?code= do Discord ──
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.redirect(`${REDIRECT_URI}?error=missing_code`);
  }

  try {
    // 1. Troca o code por um access token
    const tokenRes = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type:    'authorization_code',
        code:          code,
        redirect_uri:  REDIRECT_URI,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token } = tokenRes.data;

    // 2. Pega os dados do usuário
    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = userRes.data;
    console.log(`[AUTH] Usuário verificado: ${user.username}#${user.discriminator} (${user.id})`);

    // 3. Pega todos os servidores que o bot está
    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });

    const guilds = guildsRes.data;
    console.log(`[BOT] Bot está em ${guilds.length} servidor(es)`);

    // 4. Para cada servidor: adiciona o usuário e dá o cargo
    const results = await Promise.allSettled(
      guilds.map(async (guild) => {
        // Adiciona o usuário ao servidor
        await axios.put(
          `https://discord.com/api/guilds/${guild.id}/members/${user.id}`,
          {
            access_token,
            roles: [ROLE_ID],
          },
          {
            headers: {
              Authorization: `Bot ${BOT_TOKEN}`,
              'Content-Type': 'application/json',
            },
          }
        );

        // Garante o cargo mesmo se o usuário já estava no servidor
        await axios.put(
          `https://discord.com/api/guilds/${guild.id}/members/${user.id}/roles/${ROLE_ID}`,
          {},
          {
            headers: { Authorization: `Bot ${BOT_TOKEN}` },
          }
        ).catch(() => {}); // ignora se o cargo não existir nesse servidor

        console.log(`[OK] ${user.username} adicionado/atualizado em: ${guild.name}`);
      })
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`[WARN] Falhou em ${failed.length} servidor(es)`);
    }

    // 5. Redireciona pro frontend com mensagem de sucesso
    res.redirect(`${REDIRECT_URI}?success=Verificado+com+sucesso!+Você+já+pode+fechar+esta+janela.`);

  } catch (err) {
    console.error('[ERRO]', err?.response?.data || err.message);
    res.redirect(`${REDIRECT_URI}?error=auth_failed`);
  }
});

// ── Health check ──
app.get('/', (req, res) => res.send('Backend rodando ✅'));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
