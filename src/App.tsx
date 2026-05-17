import { useState, useEffect } from 'react'
import { supabase } from './utils/supabase'
import { APILoader, Map, MassMarks } from '@uiw/react-amap'
import { wgs84ToGcj02 } from './utils/coordTransform'
import { 
  Box, CssBaseline, Drawer, Toolbar, Typography, List, ListItem, 
  ListItemButton, ListItemText, Button, 
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, 
  Paper, Alert, AppBar, ListItemIcon
} from '@mui/material'
import TableChartIcon from '@mui/icons-material/TableChart'
import RefreshIcon from '@mui/icons-material/Refresh'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
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
  startTime?: string;
  endTime?: string;
}

const DRAWER_WIDTH = 280;

function App() {
  const [tables, setTables] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [expandedTables, setExpandedTables] = useState<string[]>([])
  const [tableDataMap, setTableDataMap] = useState<Record<string, TableDataState>>({})

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

  const fetchTableData = async (tableName: string, startTime?: string, endTime?: string) => {
    setTableDataMap(prev => ({
        ...prev,
        [tableName]: { ...(prev[tableName] || { data: [] }), error: null, startTime, endTime }
    }));
    try {
      let query = supabase.from(tableName).select('*');
      if (startTime) query = query.gte('timestamp', startTime.replace('T', ' '));
      if (endTime) query = query.lte('timestamp', endTime.replace('T', ' '));
      
      const { data, error: fetchError } = await query;
      setTableDataMap(prev => ({
        ...prev,
        [tableName]: { data: data || [], error: fetchError?.message || null, startTime, endTime }
      }))
    } catch (err: any) {
      setTableDataMap(prev => ({ ...prev, [tableName]: { data: [], error: err.message } }))
    }
  }

  const handleTableClick = (tableName: string) => {
    setExpandedTables([tableName]);
    if (!tableDataMap[tableName]) fetchTableData(tableName);
  }

  const amapKey = import.meta.env.VITE_AMAP_KEY;

  const renderDataPanel = (tableName: string) => {
    const state = tableDataMap[tableName] || { data: [], error: null, startTime: '', endTime: '' };
    const { data: tableData, startTime, endTime } = state;

    const locationData = tableData
      .filter(row => row.latitude && row.longitude)
      .map(row => {
        const [gcjLng, gcjLat] = wgs84ToGcj02(parseFloat(row.longitude), parseFloat(row.latitude));
        return { ...row, displayLng: gcjLng, displayLat: gcjLat };
      });

    return (
      <Paper elevation={2} sx={{ p: 3, mb: 4, borderRadius: 2 }} key={tableName}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h5" color="primary" sx={{ fontWeight: 600 }}>{tableName}</Typography>
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => fetchTableData(tableName, startTime, endTime)}>刷新</Button>
          </Box>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <DateTimePicker label="开始时间" value={startTime ? dayjs(startTime) : null} onChange={(v: any) => setTableDataMap(p => ({...p, [tableName]: {...p[tableName], startTime: v?.format('YYYY-MM-DD HH:mm:ss')}}))} />
                <DateTimePicker label="结束时间" value={endTime ? dayjs(endTime) : null} onChange={(v: any) => setTableDataMap(p => ({...p, [tableName]: {...p[tableName], endTime: v?.format('YYYY-MM-DD HH:mm:ss')}}))} />
                <Button variant="contained" onClick={() => fetchTableData(tableName, startTime, endTime)}>筛选</Button>
            </Box>
          </LocalizationProvider>
        </Box>
        
        {locationData.length > 0 && amapKey && (
          <Box sx={{ height: 450, mb: 3, borderRadius: 2, overflow: 'hidden', border: '1px solid #ddd' }}>
            <APILoader akey={amapKey}>
              <Map 
                // @ts-ignore
                center={[locationData[0].displayLng, locationData[0].displayLat]} 
                zoom={12}
              >
                <MassMarks 
                    // @ts-ignore
                    data={locationData.map((pos, idx) => ({ lnglat: [pos.displayLng, pos.displayLat], name: `Point ${idx + 1}` }))}
                />
              </Map>
            </APILoader>
          </Box>
        )}

        <TableContainer sx={{ maxHeight: 600, border: '1px solid #eee', borderRadius: 1 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {tableData.length > 0 && Object.keys(tableData[0]).map(k => (
                  <TableCell key={k} sx={{ bgcolor: '#f5f5f5', fontWeight: 600 }}>{k}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {tableData.map((row, i) => (
                <TableRow key={i} hover>{Object.values(row).map((v: any, j) => <TableCell key={j}>{String(v)}</TableCell>)}</TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex', bgcolor: '#f1f5f9', minHeight: '100vh' }}>
        <CssBaseline />
        <AppBar position="fixed" sx={{ zIndex: (theme: any) => theme.zIndex.drawer + 1, bgcolor: '#fff', color: '#1e293b', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
          <Toolbar>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Data Explorer</Typography>
          </Toolbar>
        </AppBar>
        <Drawer variant="permanent" sx={{ width: DRAWER_WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, border: 'none', bgcolor: '#fff' } }}>
          <Toolbar />
          <List sx={{ px: 2, mt: 1 }}>
            {tables.map(t => (
              <ListItem key={t} disablePadding sx={{ mb: 1 }}>
                <ListItemButton onClick={() => handleTableClick(t)} selected={expandedTables.includes(t)} sx={{ borderRadius: 2, '&.Mui-selected': { bgcolor: '#eff6ff', color: '#2563eb' } }}>
                  <ListItemIcon sx={{ color: 'inherit' }}><TableChartIcon /></ListItemIcon>
                  <ListItemText primary={t} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Drawer>
        <Box component="main" sx={{ flexGrow: 1, p: 4, overflow: 'auto' }}>
          <Toolbar />
          <Box sx={{ width: '100%' }}>
            {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
            {expandedTables.length === 0 && (
                <Paper sx={{ p: 8, textAlign: 'center', bgcolor: 'transparent', boxShadow: 'none' }}>
                    <Typography variant="h5" color="text.secondary">请从左侧选择一个数据表开始预览</Typography>
                </Paper>
            )}
            {expandedTables.map(t => renderDataPanel(t))}
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
