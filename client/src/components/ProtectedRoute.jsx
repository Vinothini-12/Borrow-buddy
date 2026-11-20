import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { Loading } from './Feedback.jsx'

export default function ProtectedRoute({ children }) {
  const { user, checking } = useAuth()
  const location = useLocation()
  if (checking) return <Loading label="Checking your session…" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}
