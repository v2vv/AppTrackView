import { useState, useEffect } from 'react'
import { supabase } from './utils/supabase'
import { APILoader, Map, Marker, InfoWindow } from '@uiw/react-amap'
import { wgs84ToGcj02 } from './utils/coordTransform'
import { 
  Box, CssBaseline, Drawer, Toolbar, Typography, List, ListItem, 
  ListItemButton, ListItemText, Button, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, Alert, AppBar, ListItemIcon, TextField, MenuItem
} from '@mui/material'
import TableChartIcon from '@mui/icons-material/TableChart'
import RefreshIcon from '@mui/icons-material/Refresh'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import dayjs from 'dayjs';
import './App.css'

if (typeof window !== 'undefined') {
  (window as any)._AMapSecurityConfig = { securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE };
}

const theme = createTheme({
  palette: { primary: { main: '#2563eb' }, background: { default: '#f1f5f9', paper: '#ffffff' } },
  typography: { fontFamily: '"Inter", sans-serif' },
  shape: { borderRadius: 12 }
});

interface TableDataState {
  data: any[];
  error: string | null;
  startTime?: string; // HH:mm:ss
  endTime?: string;   // HH:mm:ss
  filterYear?: string;
  filterMonth?: string;
  filterDay?: string;
  filterProvider?: string;
  // 固定候选列表
  availableYears?: string[];
  availableMonths?: string[];
  availableDays?: string[];
  availableProviders?: string[];
}

const DRAWER_WIDTH = 280;

function App() {
  const [tables, setTables] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedTables, setExpandedTables] = useState<string[]>([])
  const [tableDataMap, setTableDataMap] = useState<Record<string, TableDataState>>({})
  const [activeMarkerMap, setActiveMarkerMap] = useState<Record<string, any>>({})

  useEffect(() => { fetchTables() }, [])

  const fetchTables = async () => {
    try {
      const { data: rpcData } = await supabase.rpc('get_tables');
      if (rpcData) {
        const tableNamesSet = new Set<string>();
        rpcData.forEach((t: any) => tableNamesSet.add(t.table_name || t.tablename));
        setTables(Array.from(tableNamesSet).sort());
      }
    } catch (err: any) { setError(err.message); }
  }

  const getFullTimestamp = (state: TableDataState, timeStr: string) => {
    if (!state.filterYear || !state.filterMonth || !state.filterDay || !timeStr) return undefined;
    return `${state.filterYear}-${state.filterMonth.padStart(2, '0')}-${state.filterDay.padStart(2, '0')} ${timeStr}`;
  };

  const fetchTableData = async (tableName: string, customUpdates?: Partial<TableDataState>) => {
    const currentState = tableDataMap[tableName] || { data: [] };
    const nextState = { ...currentState, ...customUpdates };
    
    setTableDataMap(prev => ({ ...prev, [tableName]: { ...nextState, data: nextState.data || [], error: null } }));

    try {
      let query = supabase.from(tableName).select('*');
      
      const startTimeStr = getFullTimestamp(nextState, nextState.startTime || '00:00:00');
      const endTimeStr = getFullTimestamp(nextState, nextState.endTime || '23:59:59');

      if (startTimeStr) query = query.gte('timestamp', startTimeStr);
      if (endTimeStr) query = query.lte('timestamp', endTimeStr);
      if (nextState.filterProvider) query = query.eq('provider', nextState.filterProvider);
      
      const { data, error: fetchError } = await query;
      
      let extraUpdates: any = {};
      if (!currentState.availableYears && data && data.length > 0) {
          const { data: allMeta } = await supabase.from(tableName).select('timestamp, provider');
          if (allMeta) {
              const validMeta = allMeta.filter(r => {
                  const d = dayjs(String(r.timestamp), ['YYYY-MM-DD HH:mm:ss', 'HH:mm:ss', 'YYYY-MM-DD'], true);
                  return d.isValid();
              });
              const tsList = validMeta.map(r => r.timestamp).filter(Boolean);
              extraUpdates.availableYears = Array.from(new Set(tsList.map((ts: string) => ts.includes('-') ? ts.split('-')[0] : ''))).filter(Boolean).sort();
              extraUpdates.availableMonths = Array.from(new Set(tsList.map((ts: string) => ts.includes('-') ? ts.split('-')[1] : ''))).filter(Boolean).sort();
              extraUpdates.availableDays = Array.from(new Set(tsList.map((ts: string) => ts.includes('-') ? ts.split('-')[2]?.split(' ')[0] : ''))).filter(Boolean).sort();
              extraUpdates.availableProviders = Array.from(new Set(validMeta.map(r => r.provider))).filter(Boolean).sort();

              if (!nextState.filterYear) {
                  const sorted = validMeta.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
                  const latestTs = String(sorted[0].timestamp || '');
                  if (latestTs.includes('-')) {
                     const [y, m, d] = latestTs.split(/[- :]/);
                     extraUpdates.filterYear = y; extraUpdates.filterMonth = m; extraUpdates.filterDay = d;
                     extraUpdates.startTime = '00:00:00'; extraUpdates.endTime = '23:59:59';
                     const { data: initialData } = await supabase.from(tableName).select('*').gte('timestamp', `${y}-${m}-${d} 00:00:00`).lte('timestamp', `${y}-${m}-${d} 23:59:59`);
                     setTableDataMap(prev => ({ ...prev, [tableName]: { ...nextState, ...extraUpdates, data: initialData || [], error: null } }));
                     return;
                  }
              }
          }
      }

      setTableDataMap(prev => ({ ...prev, [tableName]: { ...nextState, ...extraUpdates, data: data || [], error: fetchError?.message || null } }));
    } catch (err: any) {
      setTableDataMap(prev => ({ ...prev, [tableName]: { ...nextState, data: [], error: err.message } }))
    }
  }

  const handleTableClick = (tableName: string) => {
    setExpandedTables([tableName]);
    if (!tableDataMap[tableName]) fetchTableData(tableName);
  }

  const amapKey = import.meta.env.VITE_AMAP_KEY;

  const renderDataPanel = (tableName: string) => {
    const state = tableDataMap[tableName] || { data: [], error: null, startTime: '00:00:00', endTime: '23:59:59', filterYear: '', filterMonth: '', filterDay: '', filterProvider: '', availableYears: [], availableMonths: [], availableDays: [], availableProviders: [] };
    const { 
        data: tableData = [], 
        startTime, 
        endTime, 
        filterYear, 
        filterMonth, 
        filterDay, 
        filterProvider, 
        availableYears = [], 
        availableMonths = [], 
        availableDays = [], 
        availableProviders = [] 
    } = state;

    // 过滤掉无效的时间戳格式，用于某些特定显示逻辑（如地图）
    const validTableDataForMap = tableData.filter(row => {
        if (!row.latitude || !row.longitude) return false;
        return true;
    });

    const locationData = validTableDataForMap.map(row => {
        const [gcjLng, gcjLat] = wgs84ToGcj02(parseFloat(row.longitude), parseFloat(row.latitude));
        return { ...row, displayLng: gcjLng, displayLat: gcjLat };
      });

    return (
      <Paper elevation={2} sx={{ p: 3, mb: 4, borderRadius: 2 }} key={tableName}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h5" color="primary" sx={{ fontWeight: 600 }}>{tableName}</Typography>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => fetchTableData(tableName)}>刷新</Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
             <TextField select label="年" value={filterYear || ''} onChange={(e) => fetchTableData(tableName, { filterYear: e.target.value, filterMonth: '', filterDay: '' })} sx={{ width: 100 }}>{availableYears.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}</TextField>
             <TextField select label="月" value={filterMonth || ''} onChange={(e) => fetchTableData(tableName, { filterMonth: e.target.value, filterDay: '' })} sx={{ width: 80 }}>{availableMonths.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}</TextField>
             <TextField select label="日" value={filterDay || ''} onChange={(e) => fetchTableData(tableName, { filterDay: e.target.value })} sx={{ width: 80 }}>{availableDays.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>)}</TextField>
             <TextField select label="Provider" value={filterProvider || ''} onChange={(e) => fetchTableData(tableName, { filterProvider: e.target.value })} sx={{ width: 120 }}>{availableProviders.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}</TextField>
          </Box>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <TimePicker label="开始时分" ampm={false} minutesStep={1} value={startTime ? dayjs(startTime, 'HH:mm:ss') : null} onChange={(v: any) => fetchTableData(tableName, { startTime: v?.format('HH:mm:ss') })} />
                <TimePicker label="结束时分" ampm={false} minutesStep={1} value={endTime ? dayjs(endTime, 'HH:mm:ss') : null} onChange={(v: any) => fetchTableData(tableName, { endTime: v?.format('HH:mm:ss') })} />
            </Box>
          </LocalizationProvider>
        </Box>
        {locationData.length > 0 && amapKey && (
          <Box sx={{ height: 450, mb: 3, borderRadius: 2, overflow: 'hidden', border: '1px solid #ddd' }}>
            <APILoader akey={amapKey}><Map // @ts-ignore
                center={[locationData[0].displayLng, locationData[0].displayLat]} zoom={12}>
                {locationData.map((pos: any, idx: number) => (<Marker key={idx} // @ts-ignore
                    position={[pos.displayLng, pos.displayLat]} onClick={() => setActiveMarkerMap({ [tableName]: pos })} />))}
                {activeMarkerMap[tableName] && (<InfoWindow // @ts-ignore
                    position={[activeMarkerMap[tableName].displayLng, activeMarkerMap[tableName].displayLat]} visible={true} offset={[25, -35]}
                    onClose={() => setActiveMarkerMap(prev => { const next = { ...prev }; delete next[tableName]; return next; })}>
                    <div className="info-window-card"><div className="info-window-body">
                        {Object.entries(activeMarkerMap[tableName]).map(([key, val]) => {
                          if (key === 'displayLng' || key === 'displayLat') return null;
                          return val !== undefined && val !== null ? (<div className="info-row" key={key}><span className="info-label">{key}</span><span className="info-value">{String(val)}</span></div>) : null;
                        })}</div></div></InfoWindow>)}</Map></APILoader>
          </Box>
        )}
        <TableContainer component={Paper} sx={{ maxHeight: 600, overflowX: 'auto', maxWidth: '100%' }}>
          <Table stickyHeader size="small"><TableHead><TableRow>{tableData.length > 0 && Object.keys(tableData[0]).map(k => (<TableCell key={k} sx={{ bgcolor: '#f5f5f5', fontWeight: 600 }}>{k}</TableCell>))}</TableRow></TableHead>
            <TableBody>{tableData.map((row, i) => (<TableRow key={i} hover>{Object.values(row).map((v: any, j) => <TableCell key={j}>{String(v)}</TableCell>)}</TableRow>))}</TableBody>
          </Table></TableContainer>
      </Paper>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex', bgcolor: '#f1f5f9', minHeight: '100vh' }}>
        <CssBaseline />
        <AppBar position="fixed" sx={{ zIndex: (theme: any) => theme.zIndex.drawer + 1, bgcolor: '#fff', color: '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <Toolbar><Typography variant="h6" sx={{ fontWeight: 700 }}>Data Explorer</Typography></Toolbar>
        </AppBar>
        <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 'none', bgcolor: '#fff' } }}>
          <Toolbar />
          <List sx={{ px: 2, mt: 1 }}>{tables.map(t => (
              <ListItem key={t} disablePadding sx={{ mb: 1 }}>
                <ListItemButton onClick={() => handleTableClick(t)} selected={expandedTables.includes(t)} sx={{ borderRadius: 2, '&.Mui-selected': { bgcolor: '#eff6ff', color: '#2563eb' } }}>
                  <ListItemIcon sx={{ color: 'inherit' }}><TableChartIcon /></ListItemIcon>
                  <ListItemText primary={t} />
                </ListItemButton></ListItem>))}</List>
        </Drawer>
        <Box component="main" className="main-content" sx={{ flexGrow: 1, p: 4, display: 'flex', flexDirection: 'column', height: '100vh', minWidth: 0 }}>
          <Toolbar />
          <Box sx={{ width: '100%', flex: 1, overflow: 'auto', pb: 4, minWidth: 0 }}>
            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
            {expandedTables.length === 0 && (<Paper sx={{ p: 8, textAlign: 'center', bgcolor: 'transparent', boxShadow: 'none' }}>
                    <Typography variant="h5" color="text.secondary">请从左侧选择一个数据表开始预览</Typography></Paper>)}
            {expandedTables.map(t => renderDataPanel(t))}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
