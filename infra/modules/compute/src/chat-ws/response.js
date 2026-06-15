// Helper compartido para respuestas HTTP JSON. Vive en su propio archivo
// para evitar ciclos: si esto estuviera en index.js, los HTTP handlers
// requeririan index.js para importarlo, y index.js requiere los handlers
// arriba — Node devolveria el module.exports parcial (sin jsonResponse).

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    },
    body: JSON.stringify(payload),
  };
}

module.exports = { jsonResponse };
