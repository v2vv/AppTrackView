import { useState, useEffect } from 'react'
import { supabase } from './utils/supabase'
import { APILoader, Map, Marker } from '@uiw/react-amap'
import { wgs84ToGcj02 } from './utils/coordTransform'
import './App.css'

// 配置高德地图安全密钥
if (typeof window !== 'undefined') {
  (window as any)._AMapSecurityConfig = {
    securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE,
  };
}

interface TableDataState {
  data: any[];
  loading: boolean;
  error: string | null;
}

function App() {
  const [tables, setTables] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualTableName, setManualTableName] = useState('')
  const [manualCheckResult, setManualCheckResult] = useState<string | null>(null)

  // 展开的表列表
  const [expandedTables, setExpandedTables] = useState<string[]>([])
  // 数据缓存图
  const [tableDataMap, setTableDataMap] = useState<Record<string, TableDataState>>({})

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

  const fetchTableData = async (tableName: string) => {
    // 设置该表为加载中
    setTableDataMap(prev => ({
      ...prev,
      [tableName]: { ...(prev[tableName] || { data: [] }), loading: true, error: null }
    }))
    
    try {
      const { data, error: fetchError } = await supabase
        .from(tableName)
        .select('*')
      
      if (fetchError) {
        setTableDataMap(prev => ({
          ...prev,
          [tableName]: { data: [], loading: false, error: fetchError.message }
        }))
      } else {
        setTableDataMap(prev => ({
          ...prev,
          [tableName]: { data: data || [], loading: false, error: null }
        }))
      }
    } catch (err: any) {
      setTableDataMap(prev => ({
        ...prev,
        [tableName]: { data: [], loading: false, error: err.message }
      }))
    }
  }

  const handleTableClick = (tableName: string) => {
    if (expandedTables.includes(tableName)) {
      setExpandedTables(prev => prev.filter(t => t !== tableName))
    } else {
      setExpandedTables(prev => [...prev, tableName])
      if (!tableDataMap[tableName]) {
        fetchTableData(tableName)
      }
    }
  }

  const handleExpandAll = () => {
    setExpandedTables([...tables])
    tables.forEach(tableName => {
      if (!tableDataMap[tableName]) {
        fetchTableData(tableName)
      }
    })
  }

  const handleCollapseAll = () => {
    setExpandedTables([])
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

  const amapKey = import.meta.env.VITE_AMAP_KEY;

  const renderDataPanel = (tableName: string) => {
    const state = tableDataMap[tableName] || { data: [], loading: true, error: null };
    const { data: tableData, loading: dataLoading, error: dataError } = state;

    // 检查并转换坐标数据
    const locationData = tableData
      .filter(row => 
        row.latitude !== undefined && 
        row.longitude !== undefined && 
        !isNaN(parseFloat(row.latitude)) && 
        !isNaN(parseFloat(row.longitude))
      )
      .map(row => {
        const lng = parseFloat(row.longitude);
        const lat = parseFloat(row.latitude);
        // 执行 WGS-84 到 GCJ-02 的转换
        const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
        return {
          ...row,
          displayLng: gcjLng,
          displayLat: gcjLat
        };
      });

    return (
      <div className="data-panel card" key={tableName}>
        <div className="data-header">
          <h3>数据预览: <code className="table-name-code">{tableName}</code></h3>
          <div className="data-header-actions">
            <button className="refresh-small-btn" onClick={() => fetchTableData(tableName)}>刷新</button>
            <button className="close-small-btn" onClick={() => handleTableClick(tableName)}>收起</button>
          </div>
        </div>

        {dataLoading ? (
          <p className="loading">正在获取数据...</p>
        ) : dataError ? (
          <div className="error-small">
            <p>⚠️ 无法加载数据: {dataError}</p>
          </div>
        ) : tableData.length > 0 ? (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    {Object.keys(tableData[0]).map(key => (
                      <th key={key}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val: any, j) => (
                        <td key={j}>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {locationData.length > 0 && (
              <div className="map-section">
                <h3>地理位置分布 ({tableName})</h3>
                <p className="hint" style={{ fontSize: '0.8rem', textAlign: 'left', marginBottom: '8px' }}>
                  💡 坐标已自动从 WGS-84 转换为火星坐标系 (GCJ-02) 以适配高德地图。
                </p>
                {!amapKey ? (
                  <div className="error-small">
                    <p>💡 检测到经纬度数据，但未配置高德地图 API Key。</p>
                  </div>
                ) : (
                  <div className="map-container">
                    <APILoader akey={amapKey}>
                      <Map 
                        // @ts-ignore
                        center={[locationData[0].displayLng, locationData[0].displayLat]}
                        // @ts-ignore
                        zoom={10}
                      >
                        {locationData.map((pos, idx) => (
                          <Marker 
                            key={idx} 
                            // @ts-ignore
                            position={[pos.displayLng, pos.displayLat]} 
                            title={`Point ${idx + 1}`}
                          />
                        ))}
                      </Map>
                    </APILoader>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="empty">表内暂无数据。</p>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <h1>AppTrackView</h1>
      <p className="url-tag">Connected: {import.meta.env.VITE_SUPABASE_URL}</p>

      {error && (
        <div className="error-box">
          <p>⚠️ {error}</p>
        </div>
      )}

      <div className="manual-check card">
        <h3>手动校验表</h3>
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
          <div className="list-actions">
            <button className="action-btn small" onClick={handleExpandAll} disabled={tables.length === 0}>全部展开</button>
            <button className="action-btn small" onClick={handleCollapseAll} disabled={expandedTables.length === 0}>全部收起</button>
            <button className="refresh-icon-btn" onClick={fetchTables} title="刷新列表">🔄</button>
          </div>
        </div>
        
        {loading ? (
          <p className="loading">正在扫描数据库...</p>
        ) : tables.length > 0 ? (
          <div className="table-grid">
            {tables.map(table => (
              <div 
                key={table} 
                className={`table-item ${expandedTables.includes(table) ? 'selected' : ''}`}
                onClick={() => handleTableClick(table)}
              >
                <span className="icon">📊</span>
                <span className="name">{table}</span>
              </div>
            ))}
          </div>
        ) : (
          !error && <p className="empty">未找到任何公开定义的表。</p>
        )}
      </div>

      <div className="multi-data-container">
        {expandedTables.map(tableName => renderDataPanel(tableName))}
      </div>
    </div>
  )
}

export default App
