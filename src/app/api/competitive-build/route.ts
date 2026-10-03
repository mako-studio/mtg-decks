import { runCompetitiveBuildCore, type AcquisitionOption, type CompetitiveBuildResult } from "@/lib/competitive-run";
import type { BuildProgress } from "@/lib/build-steps";

/**
 * Constructeur compétitif AVEC progression en direct (03/10/2026, demande de
 * Ben : « un loader afin que le user ait de la visibilité sur la progression
 * de la tâche et ses étapes »).
 *
 * Une Server Action ne renvoie qu'un résultat final : impossible d'y faire
 * passer des étapes. Cette route renvoie donc un FLUX de lignes JSON
 * (une ligne = un message), lu au fil de l'eau par CompetitiveBuilder.tsx :
 *   {"type":"progress", ...BuildProgress}   à chaque étape / sous-étape
 *   {"type":"result", "result": CompetitiveBuildResult}   une fois, à la fin
 *   {"type":"error", "message": "..."}      si le déroulé a levé une erreur
 *
 * Le flux se construit avec l'API Web ReadableStream, comme documenté dans
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
 * (section « Streaming »).
 *
 * `maxDuration` : même valeur et mêmes réserves que la page /collection
 * (voir src/app/collection/page.tsx) — c'est ici que le calcul tourne
 * désormais. Non vérifié sur l'hébergement : si la plateforme met la réponse
 * en tampon, les étapes arrivent d'un bloc à la fin ; le résultat reste
 * correct, et l'interface se replie sur la Server Action si le flux échoue.
 */
export const maxDuration = 300;

const ALLOWED: AcquisitionOption[] = [0, 5, 10, 15, 25];

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Requête illisible." }, { status: 400 });
  }
  const input = body as { formatKey?: unknown; collectionCards?: unknown; maxAcquisitions?: unknown };
  // Point d'entrée public : on ne fait confiance à rien de ce qui arrive
  // (runCompetitiveBuildCore revalide aussi le contenu de la liste).
  if (!Array.isArray(input.collectionCards)) {
    return Response.json({ error: "Liste de cartes manquante." }, { status: 400 });
  }
  const formatKey = input.formatKey === "duelcommander" ? "duelcommander" : "commander";
  const maxAcquisitions = ALLOWED.includes(input.maxAcquisitions as AcquisitionOption) ? (input.maxAcquisitions as AcquisitionOption) : 15;
  const collectionCards = (input.collectionCards as { name?: unknown; count?: unknown }[])
    .filter((c) => c && typeof c.name === "string" && typeof c.count === "number")
    .slice(0, 5000)
    .map((c) => ({ name: c.name as string, count: c.count as number }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (message: { type: "progress" } & BuildProgress | { type: "result"; result: CompetitiveBuildResult } | { type: "error"; message: string }) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
        } catch {
          // Le navigateur a fermé la connexion : on laisse le calcul finir sans écrire.
          closed = true;
        }
      };
      try {
        const result = await runCompetitiveBuildCore({ formatKey, collectionCards, maxAcquisitions }, (p) => send({ type: "progress", ...p }));
        send({ type: "result", result });
      } catch (err) {
        console.error("[competitive-build] échec :", err);
        send({ type: "error", message: "Erreur pendant la construction. Réessaie dans quelques instants." });
      } finally {
        if (!closed) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Demande aux proxys de ne pas mettre le flux en tampon.
      "X-Accel-Buffering": "no",
    },
  });
}
