import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { WQMaestroUI } from './WQMaestroUI'
import { ProcessStatus, ProcessOptions } from '../server/types'
import { WQMaestroUIClient } from './WQMaestroUIClient'

const maestroService = new WQMaestroUIClient()

const App = () => {
  const [processes, setProcesses] = useState<ProcessStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadProcesses = async () => {
      try {
        const processIds = await maestroService.listProcesses()
        const statuses = await Promise.all(
          processIds.map(id => maestroService.getProcessStatus(id)))
        setProcesses(statuses.filter((s): s is ProcessStatus => s !== undefined))
        setLoading(false)
      } catch (error) {
        console.error('Failed to load processes:', error)
        setLoading(false)
      }
    }

    loadProcesses()

    // Handle real-time updates from service
    maestroService.socket.addEventListener('message', (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'processEvent') {
        loadProcesses() // Refresh on updates
      }
    })

    return () => {
      maestroService.socket.removeEventListener('message', () => {})
    }
  }, [])

  const handleStartProcess = async (options: ProcessOptions) => {
    try {
      await maestroService.startProcess(options)
    } catch (error) {
      console.error('Failed to start process:', error)
      throw error
    }
  }

  const handleStopProcess = async (processId: string) => {
    try {
      await maestroService.stopProcess(processId)
    } catch (error) {
      console.error('Failed to stop process:', error)
      throw error
    }
  }

  if (loading) {
    return <div>Loading processes...</div>
  }

  return (
    <WQMaestroUI
      processes={processes}
      onStartProcess={handleStartProcess}
      onStopProcess={handleStopProcess}
      onStartAgent={async (port, image) => {
        const response = await fetch('/api/agents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ image, port })
        });
        if (!response.ok) throw new Error('Failed to start agent');
      }}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)