import { Suspense } from "react";
import { Dashboard } from "./_components/dashboard";

export default function Page() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
