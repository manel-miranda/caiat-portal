import { createFileRoute } from "@tanstack/react-router";
import { DishViewer } from "@/components/DishViewer";
export const Route = createFileRoute("/ar-test")({ component: () => <DishViewer /> });
