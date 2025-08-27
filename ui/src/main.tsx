import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './components/App'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WebSocketProvider } from './providers/connection.provider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      staleTime: Infinity
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <WebSocketProvider url="ws://localhost:8080">
      <App />
    </WebSocketProvider>
  </QueryClientProvider>
)
