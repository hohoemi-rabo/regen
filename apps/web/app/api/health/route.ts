export async function GET() {
  return Response.json({ ok: true, service: "regen", time: new Date().toISOString() });
}
