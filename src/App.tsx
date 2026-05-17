import { useState } from 'react'
import { getSupabase } from './supabaseClient'
import './App.css'

interface TableInfo {
  table_name: string;
}

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
      const supabase = getSupabase(url, key)
      
      // 注意：Supabase JS 客户端没有直接列出所有表的标准 API。
      // 这里我们尝试通过查询 postgrest 的信息来获取表列表。
      // 另一种方法是使用 RPC 调用或直接尝试从常用表中读取，但为了通用性，
      // 我们尝试查询 information_schema (这通常需要更高的权限，但在某些配置下可用)。
      // 对于一般的 Anon Key，我们可以尝试获取 API 定义。
      
      const { data, error: fetchError } = await supabase
        .from('pg_tables') // 这是一个假设，通常 information_schema.tables 更标准
        .select('tablename')
        .filter('schemaname', 'eq', 'public')

      if (fetchError) {
        // 如果直接查询 pg_tables 失败（通常会失败，权限限制），
        // 我们可以告知用户。在 Supabase 中展示所有表通常需要设置 RPC。
        console.error('Fetch error:', fetchError)
        
        // 备选方案：告诉用户如何通过 RPC 实现
        setError(`无法直接列出表。请确保您在 Supabase SQL Editor 中运行了以下函数：
        CREATE OR REPLACE FUNCTION get_tables()
        RETURNS TABLE (table_name text) 
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        BEGIN
          RETURN QUERY SELECT tablename::text FROM pg_tables WHERE schemaname = 'public';
        END;
        $$;`)
        
        // 尝试使用 RPC 如果已存在
        const { data: rpcData, error: rpcError } = await supabase.rpc('get_tables')
        if (!rpcError && rpcData) {
           setTables(rpcData.map((t: any) => t.table_name))
           setError(null)
        }
      } else if (data) {
        setTables(data.map((t: any) => t.tablename))
      }
    } catch (err: any) {
      setError(err.message || '连接失败')
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
          !loading && <p>暂无数据</p>
        )}
      </div>
    </div>
  )
}

export default App
