import { useState } from 'react'
import { getSupabase } from './supabaseClient'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTables = async () => {
    if (!url || !key) {
      setError('请输入 Supabase URL 和 Anon Key')
      return
    }

    setLoading(true)
    setError(null)
    setTables([])

    try {
      // 方法 1: 尝试通过 Postgrest 的根路径获取 OpenAPI 定义
      // 这通常包含了所有的公开表名，且 Anon Key 即可访问
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
          const tableNames = Object.keys(data.definitions)
          setTables(tableNames)
          return
        }
      }

      // 方法 2: 如果方法 1 失败（例如 CORS 或自定义路径），尝试使用 RPC (之前的备选方案)
      const supabase = getSupabase(url, key)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_tables')
      
      if (!rpcError && rpcData) {
        setTables(rpcData.map((t: any) => t.table_name || t.tablename))
      } else {
        setError(`无法自动获取表。如果您的数据库有表但未显示，请在 Supabase SQL Editor 中运行以下函数以启用 RPC 获取：

CREATE OR REPLACE FUNCTION get_tables()
RETURNS TABLE (table_name text) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT tablename::text FROM pg_tables WHERE schemaname = 'public';
END;
$$;`)
      }
    } catch (err: any) {
      setError(`连接错误: ${err.message}`)
    } finally {
      setLoading(false)
    }
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
        <button onClick={fetchTables} disabled={loading}>
          {loading ? '正在连接...' : '连接并获取表'}
        </button>
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
