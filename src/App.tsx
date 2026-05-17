import { useState, useEffect } from 'react'
import { supabase } from './utils/supabase'
import './App.css'

function App() {
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTables()
  }, [])

  const fetchTables = async () => {
    setLoading(true)
    setError(null)

    try {
      const url = import.meta.env.VITE_SUPABASE_URL
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

      if (!url || !key) {
        setError('环境变量中缺失 Supabase 凭据，请检查 .env 文件。')
        return
      }

      let tableNamesSet = new Set<string>()

      // 自动探测：尝试通过 OpenAPI 获取定义
      try {
        const restUrl = `${url.replace(/\/$/, '')}/rest/v1/`
        const response = await fetch(restUrl, {
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
          }
        })
        if (response.ok) {
          const data = await response.json()
          if (data.definitions) {
            Object.keys(data.definitions).forEach(name => tableNamesSet.add(name))
          }
        }
      } catch (e) {
        console.error('OpenAPI fetch failed', e)
      }

      // 如果 OpenAPI 没找到，尝试 RPC
      if (tableNamesSet.size === 0) {
        const { data: rpcData } = await supabase.rpc('get_tables')
        if (rpcData && Array.isArray(rpcData)) {
          rpcData.forEach((t: any) => tableNamesSet.add(t.table_name || t.tablename))
        }
      }

      const finalTables = Array.from(tableNamesSet).sort()

      if (finalTables.length > 0) {
        setTables(finalTables)
      } else {
        setError('未能自动检测到表。如果您的数据库有表，请参考之前的 SQL 函数指南。')
      }
    } catch (err: any) {
      setError(`加载失败: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <h1>AppTrackView</h1>
      <p className="subtitle">已连接至：{import.meta.env.VITE_SUPABASE_URL}</p>
      
      {error && (
        <div className="error-box">
          <p>{error}</p>
        </div>
      )}

      <div className="table-list">
        <h2>数据库表 ({tables.length})</h2>
        {loading ? (
          <p className="loading-hint">正在扫描数据库...</p>
        ) : tables.length > 0 ? (
          <ul>
            {tables.map(table => (
              <li key={table}>
                <span className="table-icon">📊</span>
                {table}
              </li>
            ))}
          </ul>
        ) : (
          !error && <p className="empty-hint">未找到公开表</p>
        )}
      </div>

      <div className="footer">
        <button onClick={fetchTables} className="refresh-btn">刷新列表</button>
      </div>
    </div>
  )
}

export default App
