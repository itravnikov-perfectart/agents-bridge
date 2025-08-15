import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { WQMaestroUI } from './WQMaestroUI'
import { ProcessStatus, ProcessOptions } from '../server/types'

declare global {
  interface Window {
    agentMaestro: {
      controllers: Array<{id: string, workspace: string}>
      activeControllerId: string
      onActivate: (id: string) => void
      onRemove: (id: string) => void
      onSendMessage: (message: string) => void
    }
  }
}

const App = () => {
  const [processes, setProcesses] = useState<ProcessStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [executionOutput, setExecutionOutput] = useState('')
  const [controllers, setControllers] = useState<Array<{id: string, workspace: string}>>([])
  const [activeControllerId, setActiveControllerId] = useState('')

  useEffect(() => {
    // Initialize controllers from global window object
    if (window.agentMaestro) {
      setControllers(window.agentMaestro.controllers)
      setActiveControllerId(window.agentMaestro.activeControllerId)
    }

    const loadProcesses = async () => {
      try {
        setProcesses([])
        setLoading(false)
      } catch (error) {
        console.error('Failed to load processes:', error)
        setLoading(false)
      }
    }

    loadProcesses()

    // Handle messages from VSCode
    window.addEventListener('message', (event) => {
      const message = event.data
      switch(message.command) {
        case 'controllersUpdated':
          setControllers(message.controllers)
          setActiveControllerId(message.activeControllerId)
          break
      }
    })
  }, [])

  const handleStartProcess = async (options: ProcessOptions) => {
    throw new Error('Process management not implemented in this UI')
  }

  const handleStopProcess = async (processId: string) => {
    throw new Error('Process management not implemented in this UI')
  }

  const handleSendToRoo = async (message: string): Promise<string> => {
    try {
      if (window.agentMaestro?.onSendMessage) {
        window.agentMaestro.onSendMessage(message)
        return 'Message sent to RooCode'
      }
      throw new Error('No message handler available')
    } catch (error) {
      console.error('Failed to send to Roo:', error)
      setExecutionOutput(`Error: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }

  if (loading) {
    return <div>Loading processes...</div>
  }

  return (
    <div className="agent-maestro-ui">
      <div className="controllers-list">
        <h2>Agent Maestro Controllers</h2>
        {controllers.map(controller => (
          <div
            key={controller.id}
            className={`controller ${controller.id === activeControllerId ? 'active' : ''}`}
          >
            <div>{controller.id}</div>
            <div className="workspace-path">{controller.workspace}</div>
            <button onClick={() => window.agentMaestro?.onActivate(controller.id)}>
              Activate
            </button>
            <button onClick={() => window.agentMaestro?.onRemove(controller.id)}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <WQMaestroUI
        processes={processes}
        onStartProcess={handleStartProcess}
        onStopProcess={handleStopProcess}
        onStartAgent={async () => {}}
        onSendToRoo={handleSendToRoo}
        executionOutput={executionOutput}
      />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)