import { useState, useEffect } from 'react'
import { supabase } from './utils/supabase'
import './App.css'

function App() {
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualTableName, setManualTableName] = useState('')
  const [manualCheckResult, setManualCheckResult] = useState<string | null>(null)

  useEffect(() => {
    fetchTables()
  }, [])

  const fetchTables = async () => {
    setLoading(true)
    setError(null)
    setTables([])

    try {
      const url = import.meta.env.VITE_SUPABASE_URL
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

      if (!url || !key) {
        setError('环境变量缺失。请确保 .env 文件中包含 VITE_SUPABASE_URL 和 VITE_SUPABASE_PUBLISHABLE_KEY')
        return
      }

      const tableNamesSet = new Set<string>()

      // 探测方法 1: 增强的 OpenAPI 扫描 (Definitions + Paths)
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
          
          // 检查 definitions (Swagger 结构)
          if (data.definitions) {
            Object.keys(data.definitions).forEach(name => tableNamesSet.add(name))
          }
          
          // 检查 paths (有时 definitions 为空，但路径中存在表名)
          if (data.paths) {
            Object.keys(data.paths).forEach(path => {
              const cleanPath = path.replace(/^\//, '').split('?')[0]
              if (cleanPath && cleanPath !== 'rpc' && !cleanPath.includes('/')) {
                tableNamesSet.add(cleanPath)
              }
            })
          }
        }
      } catch (e) {
        console.error('OpenAPI detection failed', e)
      }

      // 探测方法 2: RPC 备选 (如果用户运行了之前建议的 SQL 函数)
      if (tableNamesSet.size === 0) {
        try {
          const { data: rpcData } = await supabase.rpc('get_tables')
          if (rpcData && Array.isArray(rpcData)) {
            rpcData.forEach((t: any) => tableNamesSet.add(t.table_name || t.tablename))
          }
        } catch (e) {
          console.error('RPC detection failed', e)
        }
      }

      const finalTables = Array.from(tableNamesSet).sort()
      if (finalTables.length > 0) {
        setTables(finalTables)
      } else {
        setError('未能自动检测到公开表。')
      }
    } catch (err: any) {
      setError(`加载失败: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const checkManualTable = async () => {
    if (!manualTableName) return
    setManualCheckResult('正在检查...')
    
    try {
      const { data, error } = await supabase.from(manualTableName).select('*').limit(1)
      if (error) {
        setManualCheckResult(`表 "${manualTableName}" 访问失败: ${error.message}`)
      } else {
        setManualCheckResult(`成功！表 "${manualTableName}" 存在且可访问（找到 ${data?.length || 0} 条数据）。`)
        if (!tables.includes(manualTableName)) {
          setTables(prev => [...prev, manualTableName].sort())
        }
      }
    } catch (err: any) {
      setManualCheckResult(`错误: ${err.message}`)
    }
  }

  return (
    <div className="container">
      <h1>AppTrackView</h1>
      <p className="url-tag">Connected: {import.meta.env.VITE_SUPABASE_URL}</p>

      {error && (
        <div className="error-box">
          <p>⚠️ {error}</p>
          <div className="sql-helper">
            <p><b>为什么看不到表？</b></p>
            <ul>
              <li>您的表可能没有开启 <b>RLS (Row Level Security)</b> 且没有 <code>SELECT</code> 权限给 <code>anon</code> 角色。</li>
              <li>您可以尝试在 Supabase SQL Editor 中运行以下代码来启用自动列出功能：</li>
            </ul>
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
        </div>
      )}

      <div className="manual-check card">
        <h3>手动校验表</h3>
        <p className="hint">如果自动探测不到，请输入表名（如 <code>todos</code>）直接尝试访问：</p>
        <div className="input-row">
          <input 
            type="text" 
            placeholder="输入表名..." 
            value={manualTableName}
            onChange={(e) => setManualTableName(e.target.value)}
          />
          <button onClick={checkManualTable}>检查</button>
        </div>
        {manualCheckResult && <p className="result-msg">{manualCheckResult}</p>}
      </div>

      <div className="table-list card">
        <div className="list-header">
          <h2>探测到的表 ({tables.length})</h2>
          <button className="refresh-icon-btn" onClick={fetchTables} title="刷新">🔄</button>
        </div>
        
        {loading ? (
          <p className="loading">正在扫描数据库...</p>
        ) : tables.length > 0 ? (
          <div className="table-grid">
            {tables.map(table => (
              <div key={table} className="table-item">
                <span className="icon">📊</span>
                <span className="name">{table}</span>
              </div>
            ))}
          </div>
        ) : (
          !error && <p className="empty">未找到任何公开定义的表。</p>
        )}
      </div>
    </div>
  )
}

export default App
