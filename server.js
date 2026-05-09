const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID     = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const BOT_TOKEN     = process.env.BOT_TOKEN;
const ROLE_ID       = process.env.ROLE_ID;
const REDIRECT_URI  = process.env.REDIRECT_URI || 'https://backend-c6qx.onrender.com/callback';
const WEBHOOK_URL   = process.env.WEBHOOK_URL;

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.redirect(`${REDIRECT_URI}?error=missing_code`);
  }

  try {
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

    const userRes = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = userRes.data;

    const guildsRes = await axios.get('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bot ${BOT_TOKEN}` },
    });

    const guilds = guildsRes.data;

    const results = await Promise.allSettled(
      guilds.map(async (guild) => {
        await axios.put(
          `https://discord.com/api/guilds/${guild.id}/members/${user.id}`,
          { access_token, roles: [ROLE_ID] },
          { headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' } }
        );

        await axios.put(
          `https://discord.com/api/guilds/${guild.id}/members/${user.id}/roles/${ROLE_ID}`,
          {},
          { headers: { Authorization: `Bot ${BOT_TOKEN}` } }
        ).catch(() => {});
      })
    );

    if (WEBHOOK_URL) {
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      await axios.post(WEBHOOK_URL, {
        embeds: [{
          title: '✅ Nova Verificação',
          color: 0x23a55a,
          thumbnail: { url: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` },
          fields: [
            { name: '👤 Usuário', value: `<@${user.id}> \`${user.username}\``, inline: true },
            { name: '🆔 ID', value: `\`${user.id}\``, inline: true },
            { name: '🌐 Servidores', value: `Adicionado em **${successCount}** servidor(es)`, inline: false }
          ],
          footer: { text: 'Sistema de Verificação' },
          timestamp: new Date().toISOString()
        }]
      }).catch(() => {});
    }

    res.redirect(`https://oauthbot.netlify.app/?success=Verificado+com+sucesso!+Você+já+pode+fechar+esta+janela.`);

  } catch (err) {
    console.error('[ERRO]', err?.response?.data || err.message);
    res.redirect(`https://oauthbot.netlify.app/?error=auth_failed`);
  }
});

app.get('/', (req, res) => res.send('Backend rodando ✅'));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
