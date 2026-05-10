import { Suspense } from "react";
import { Dashboard } from "@/components/dashboard";

export default function WorldViewPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
