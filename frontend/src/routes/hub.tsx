import { Outlet } from "react-router-dom";
import { HubLayout } from "@/components/hub-layout";

export default function HubPage() {
  return (
    <HubLayout>
      <Outlet />
    </HubLayout>
  );
}
