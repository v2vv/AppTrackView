import { useState, useEffect } from 'react'
import { getSupabase } from './supabaseClient'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 页面加载时从 localStorage 读取保存的凭据
  useEffect(() => {
    const savedUrl = localStorage.getItem('supabase_url')
    const savedKey = localStorage.getItem('supabase_key')
    if (savedUrl) setUrl(savedUrl)
    if (savedKey) setKey(savedKey)
  }, [])

  const fetchTables = async () => {
    if (!url || !key) {
      setError('请输入 Supabase URL 和 Anon Key')
      return
    }

    setLoading(true)
    setError(null)
    setTables([])

    try {
      const restUrl = `${url.replace(/\/$/, '')}/rest/v1/`
      const response = await fetch(restUrl, {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`
        }
      })

      let tableNames: string[] = []

      if (response.ok) {
        const data = await response.json()
        if (data.definitions) {
          tableNames = Object.keys(data.definitions)
        }
      }

      if (tableNames.length === 0) {
        const supabase = getSupabase(url, key)
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_tables')
        if (!rpcError && rpcData) {
          tableNames = rpcData.map((t: any) => t.table_name || t.tablename)
        }
      }

      if (tableNames.length > 0) {
        setTables(tableNames)
        // 成功获取数据后，将凭据保存到 localStorage
        localStorage.setItem('supabase_url', url)
        localStorage.setItem('supabase_key', key)
      } else {
        setError(`无法自动获取表。如果您的数据库有表但未显示，请在 Supabase SQL Editor 中运行 get_tables 函数。`)
      }
    } catch (err: any) {
      setError(`连接错误: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const clearSavedCredentials = () => {
    localStorage.removeItem('supabase_url')
    localStorage.removeItem('supabase_key')
    setUrl('')
    setKey('')
    setTables([])
    alert('已清除保存的凭据')
  }

  return (
    <div className="container">
      <h1>Supabase Explorer</h1>
      
      <div className="input-group">
        <input 
          type="text" 
          placeholder="Supabase Project URL" 
          value={url} 
          onChange={(e) => setUrl(e.target.value)} 
        />
        <input 
          type="password" 
          placeholder="Anon Key" 
          value={key} 
          onChange={(e) => setKey(e.target.value)} 
        />
        <div className="button-row">
          <button onClick={fetchTables} disabled={loading} className="primary-btn">
            {loading ? '正在连接...' : '连接并保存'}
          </button>
          <button onClick={clearSavedCredentials} className="secondary-btn">
            清除保存
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <p style={{ color: 'red', whiteSpace: 'pre-wrap' }}>{error}</p>
        </div>
      )}

      <div className="table-list">
        <h2>表列表</h2>
        {tables.length > 0 ? (
          <ul>
            {tables.map(table => (
              <li key={table}>{table}</li>
            ))}
          </ul>
        ) : (
          !loading && <p>暂无数据 (或未找到公开表)</p>
        )}
      </div>
    </div>
  )
}

export default App
