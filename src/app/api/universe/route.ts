import { NextResponse } from 'next/server';
import { listUniverses } from '@/lib/universes';
import { rechazarParametros } from '@/lib/api';

export const runtime = 'nodejs';

/** Catálogo de universos disponibles. */
export async function GET(request: Request) {
  return rechazarParametros(request) ?? NextResponse.json({ universes: listUniverses() });
}
