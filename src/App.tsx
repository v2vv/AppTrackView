import { useState, useEffect } from 'react'
import { getSupabase } from './supabaseClient'
import './App.css'

function App() {
  const [url, setUrl] = useState('')
  const [key, setKey] = useState('')
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSqlGuide, setShowSqlGuide] = useState(false)

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
    setShowSqlGuide(false)

    try {
      let tableNamesSet = new Set<string>()

      // 探测方法 1: Postgrest OpenAPI 规范 (最常用且 Anon 友好)
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
          // 检查 definitions
          if (data.definitions) {
            Object.keys(data.definitions).forEach(name => tableNamesSet.add(name))
          }
          // 检查 paths (有时 definitions 不完整)
          if (data.paths) {
            Object.keys(data.paths).forEach(path => {
              const name = path.replace(/^\//, '').split('?')[0]
              if (name && name !== 'rpc' && !name.includes('/')) {
                tableNamesSet.add(name)
              }
            })
          }
        }
      } catch (e) { console.error('OpenAPI fetch failed', e) }

      // 探测方法 2: 直接通过 RPC (如果用户已经运行了 SQL 函数)
      if (tableNamesSet.size === 0) {
        try {
          const supabase = getSupabase(url, key)
          const { data: rpcData } = await supabase.rpc('get_tables')
          if (rpcData && Array.isArray(rpcData)) {
            rpcData.forEach((t: any) => tableNamesSet.add(t.table_name || t.tablename))
          }
        } catch (e) { console.error('RPC failed', e) }
      }

      // 探测方法 3: 尝试查询 information_schema.tables (部分配置允许)
      if (tableNamesSet.size === 0) {
        try {
          const supabase = getSupabase(url, key)
          const { data } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
          if (data) {
            data.forEach((t: any) => tableNamesSet.add(t.table_name))
          }
        } catch (e) { console.error('Information schema query failed', e) }
      }

      const finalTables = Array.from(tableNamesSet).sort()

      if (finalTables.length > 0) {
        setTables(finalTables)
        localStorage.setItem('supabase_url', url)
        localStorage.setItem('supabase_key', key)
      } else {
        setError('未能自动检测到表。')
        setShowSqlGuide(true)
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
    setShowSqlGuide(false)
    setError(null)
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
            {loading ? '正在探测...' : '连接并获取'}
          </button>
          <button onClick={clearSavedCredentials} className="secondary-btn">
            清除记录
          </button>
        </div>
      </div>

      {error && (
        <div className="error-box">
          <p>{error}</p>
          {showSqlGuide && (
            <div className="sql-guide">
              <p>请在您的 Supabase <b>SQL Editor</b> 中运行以下代码以允许应用列出表：</p>
              <pre>
{`CREATE OR REPLACE FUNCTION get_tables()
RETURNS TABLE (table_name text) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT tablename::text 
  FROM pg_tables 
  WHERE schemaname = 'public';
END;
$$;`}
              </pre>
            </div>
          )}
        </div>
      )}

      <div className="table-list">
        <h2>表列表 ({tables.length})</h2>
        {tables.length > 0 ? (
          <ul>
            {tables.map(table => (
              <li key={table}>
                <span className="table-icon">📊</span>
                {table}
              </li>
            ))}
          </ul>
        ) : (
          !loading && !error && <p className="empty-hint">暂无数据，请尝试连接</p>
        )}
      </div>
    </div>
  )
}

export default App
