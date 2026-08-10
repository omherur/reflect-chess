import { ImportFlow } from "@/components/import/import-flow";

export default function ImportPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Import a game</h1>
      <p className="mt-1 text-stone-600">
        Pull recent games from Chess.com, or paste a PGN directly.
      </p>
      <div className="mt-8">
        <ImportFlow />
      </div>
    </div>
  );
}
