import axios from 'axios'
import { storage } from '../utils/storage'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Attach the auth token to every outgoing request
api.interceptors.request.use((config) => {
  const token = storage.getToken()
  if (token) {
    config.headers.Authorization = `Token ${token}`
  }
  return config
})

// If the server rejects the token, clear the session and go to the login page
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login/')

    if (error.response?.status === 401 && !isLoginRequest) {
      storage.clear()
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)

export default api