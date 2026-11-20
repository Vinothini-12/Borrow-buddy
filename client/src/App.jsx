import { Link, Route, Routes } from 'react-router-dom'
import { EmptyState } from './components/Feedback.jsx'
import Navbar from './components/Navbar.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import ItemDetail from './pages/ItemDetail.jsx'
import Login from './pages/Login.jsx'
import MyItems from './pages/MyItems.jsx'
import MyRequests from './pages/MyRequests.jsx'
import Register from './pages/Register.jsx'

function NotFound() {
  return (
    <div className="container section">
      <EmptyState title="Page not found">
        <Link to="/" className="btn">Back to home</Link>
      </EmptyState>
    </div>
  )
}

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/items/:id" element={<ItemDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/my-items" element={<ProtectedRoute><MyItems /></ProtectedRoute>} />
          <Route path="/my-requests" element={<ProtectedRoute><MyRequests /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  )
}
