import { createFileRoute } from "@tanstack/react-router";
import { DishViewer } from "@/components/DishViewer";

export const Route = createFileRoute("/ar-test")({
  ssr: false,
  component: () => (
    <main className="mx-auto w-full max-w-lg p-4">
      <DishViewer />
    </main>
  ),
});
