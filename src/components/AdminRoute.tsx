import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "@/components/SessionContextProvider";

interface AdminRouteProps {
  children: React.ReactNode;
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { isAdmin } = useSession();
  const location = useLocation();

  if (!isAdmin) {
    return <Navigate to="/app" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
};

export default AdminRoute;
