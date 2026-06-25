const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const GRAPH_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

// Extrae el primer numero de guia (alfanumerico, 4-30 caracteres) que el cliente escribio
function extraerNumeroGuia(texto) {
  if (!texto) return null;
  const match = texto.toUpperCase().match(/[A-Z0-9-]{4,30}/);
  return match ? match[0] : null;
}

async function enviarMensaje(numeroTelefono, texto) {
  if (!TOKEN || !PHONE_NUMBER_ID) {
    console.warn('WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID no configurados, no se envia mensaje');
    return;
  }
  const res = await fetch(GRAPH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numeroTelefono,
      type: 'text',
      text: { body: texto },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Error enviando mensaje de WhatsApp:', res.status, body);
  }
}

module.exports = { extraerNumeroGuia, enviarMensaje };
