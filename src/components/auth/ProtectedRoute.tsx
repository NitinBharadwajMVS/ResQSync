import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';

export const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles?: ('ambulance' | 'hospital' | 'admin')[] }) => {
  const { currentUser } = useApp();
  const location = useLocation();

  if (!currentUser) {
    // Redirect them to the home page, but save the current location they were
    // trying to go to when they were redirected.
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role as any)) {
    // If user has a role but isn't allowed to access this specific route
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
