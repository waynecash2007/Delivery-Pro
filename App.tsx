
import React, { useState, useEffect, useRef } from 'react';
import { DeliveryPoint, StagedPhoto } from './types';
import { extractAddressesFromBatch, optimizeRoute } from './services/geminiService';
import { DeliveryCard } from './components/DeliveryCard';

const App: React.FC = () => {
  const [points, setPoints] = useState<DeliveryPoint[]>([]);
  const [stagedItems, setStagedItems] = useState<StagedPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualAddress, setManualAddress] = useState("");
  const [userCoords, setUserCoords] = useState<{ lat: number, lng: number } | undefined>();

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("GPS error:", err),
        { enableHighAccuracy: true }
      );
    }
  }, []);

  const refreshLocation = (): Promise<{lat: number, lng: number}> => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserCoords(coords);
          resolve(coords);
        },
        (err) => reject(err),
        { enableHighAccuracy: true }
      );
    });
  };

  const processInBatches = async (newItems: StagedPhoto[]) => {
    const BATCH_SIZE = 3; // Processing 3 images at once is significantly faster
    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const batch = newItems.slice(i, i + BATCH_SIZE);
      const images = batch.map(item => item.data);
      
      try {
        const addresses = await extractAddressesFromBatch(images);
        setStagedItems(prev => prev.map(item => {
          const batchIndex = batch.findIndex(b => b.id === item.id);
          if (batchIndex !== -1) {
            return { 
              ...item, 
              address: addresses[batchIndex] || "解析失敗", 
              status: addresses[batchIndex] ? 'done' : 'error' 
            };
          }
          return item;
        }));
      } catch (err) {
        setStagedItems(prev => prev.map(item => 
          batch.some(b => b.id === item.id) ? { ...item, status: 'error' } : item
        ));
      }
    }
  };

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newItems: StagedPhoto[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const photoId = Math.random().toString(36).substr(2, 9);
      newItems.push({
        id: photoId,
        data: base64,
        address: "正在秒速識別...",
        status: 'processing'
      });
    }

    setStagedItems(prev => [...prev, ...newItems]);
    processInBatches(newItems);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateStagedAddress = (id: string, newAddress: string) => {
    setStagedItems(prev => prev.map(item => 
      item.id === id ? { ...item, address: newAddress, status: 'done' } : item
    ));
  };

  const removeStagedItem = (id: string) => {
    setStagedItems(prev => prev.filter(item => item.id !== id));
  };

  const startPlanning = async () => {
    const validItems = stagedItems.filter(item => item.address && item.status !== 'processing');
    if (validItems.length === 0) {
      alert("請等待至少一個地址分析完成。");
      return;
    }
    
    setLoading(true);
    setLoadingMsg("正在規劃首個目的地...");

    try {
      const newPoints: DeliveryPoint[] = validItems.map((item, idx) => ({
        id: item.id,
        address: item.address,
        status: 'pending',
        order: points.length + idx
      }));

      const coords = await refreshLocation().catch(() => undefined);
      const pendingPoints = points.filter(p => p.status !== 'completed');
      const completedOnes = points.filter(p => p.status === 'completed');
      
      // The optimization will now properly set the closest point as the first destination
      const optimized = await optimizeRoute([...pendingPoints, ...newPoints], coords);
      setPoints([...completedOnes, ...optimized]);
      setStagedItems([]); 
    } catch (error) {
      console.error(error);
      alert("路徑規劃失敗。");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (id: string) => {
    let updatedPoints = points.map(p => {
      if (p.id === id) return { ...p, status: 'completed' as const };
      return p;
    });
    const nextPendingIndex = updatedPoints.findIndex(p => p.status === 'pending');
    if (nextPendingIndex !== -1) updatedPoints[nextPendingIndex].status = 'current';
    setPoints(updatedPoints);
  };

  const handleReoptimize = async () => {
    setLoading(true);
    setLoadingMsg("重新定位並優化路線...");
    try {
      const coords = await refreshLocation().catch(() => undefined);
      const pendingPoints = points.filter(p => p.status !== 'completed');
      const completedPoints = points.filter(p => p.status === 'completed');
      const optimizedPending = await optimizeRoute(pendingPoints, coords);
      setPoints([...completedPoints, ...optimizedPending]);
    } catch (e) {
      alert("更新失敗");
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = (address: string) => {
    const encoded = encodeURIComponent(address + ", Hong Kong");
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`, '_blank');
  };

  const handleRemove = (id: string) => {
    setPoints(prev => prev.filter(p => p.id !== id));
  };

  const handleAddManual = async () => {
    if (!manualAddress.trim()) return;
    setLoading(true);
    setLoadingMsg("正在將新地址加入路線...");
    const newPoint: DeliveryPoint = {
      id: Math.random().toString(36).substr(2, 9),
      address: manualAddress,
      status: 'pending',
      order: points.length
    };
    try {
      const coords = await refreshLocation().catch(() => undefined);
      const pendingPoints = points.filter(p => p.status !== 'completed');
      const completedPoints = points.filter(p => p.status === 'completed');
      const updated = await optimizeRoute([...pendingPoints, newPoint], coords);
      setPoints([...completedPoints, ...updated]);
    } catch (e) {
      alert("新增失敗");
    } finally {
      setManualAddress("");
      setShowAddManual(false);
      setLoading(false);
    }
  };

  const isAnyProcessing = stagedItems.some(item => item.status === 'processing');
  const completedCount = points.filter(p => p.status === 'completed').length;
  const progress = points.length > 0 ? (completedCount / points.length) * 100 : 0;

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 pb-40 font-sans selection:bg-blue-100">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-200 p-4 shadow-sm">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">HK DELIVERY <span className="text-blue-600">PRO</span></h1>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isAnyProcessing ? 'bg-orange-400 animate-pulse' : 'bg-green-500'}`}></span>
              <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">
                {isAnyProcessing ? '分析中 (Batch Processing)' : '系統就緒'}
              </span>
            </div>
          </div>
          {points.length > 0 && (
            <button 
              onClick={handleReoptimize}
              className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center active:scale-90 transition-all border border-blue-100"
            >
              <i className="fas fa-arrows-rotate"></i>
            </button>
          )}
        </div>

        {points.length > 0 && (
          <div className="mt-2">
            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="p-4">
        
        {/* Empty State */}
        {points.length === 0 && !loading && stagedItems.length === 0 && (
          <div className="text-center py-12 px-6">
            <div className="w-24 h-24 bg-blue-600 text-white rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-blue-200 rotate-3">
              <i className="fas fa-bolt text-4xl"></i>
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-2">極速配送規劃</h2>
            <p className="text-slate-500 text-sm mb-10">一次過影幾張相，系統會分組在背景自動解析地址，大幅縮短等待時間。</p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-slate-900 text-white w-full py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all"
            >
              <i className="fas fa-plus mr-2"></i> 開始拍照上傳
            </button>
          </div>
        )}

        {/* Staging Area with Batch Status */}
        {stagedItems.length > 0 && (
          <div className="mb-8 space-y-4">
            <div className="flex justify-between items-center px-1">
              <h3 className="font-black text-slate-900 text-lg">待處理 ({stagedItems.length})</h3>
              <button onClick={() => fileInputRef.current?.click()} className="text-blue-600 text-xs font-black bg-blue-50 px-3 py-1.5 rounded-full">
                續拍 <i className="fas fa-camera ml-1"></i>
              </button>
            </div>
            
            <div className="space-y-3">
              {stagedItems.map((item) => (
                <div key={item.id} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex gap-4 items-center group">
                  <div className="relative w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden bg-slate-100">
                    <img src={item.data} className="w-full h-full object-cover" alt="Parcel" />
                    {item.status === 'processing' && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input 
                      type="text" 
                      value={item.address}
                      onChange={(e) => updateStagedAddress(item.id, e.target.value)}
                      className={`text-sm font-bold bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none w-full py-1 ${
                        item.status === 'processing' ? 'text-slate-300 italic' : 'text-slate-800'
                      }`}
                    />
                    <p className="text-[9px] text-slate-400 font-black uppercase mt-1">
                      {item.status === 'done' ? '已辨識 - 可手動修改' : item.status}
                    </p>
                  </div>
                  <button onClick={() => removeStagedItem(item.id)} className="text-slate-200 hover:text-red-500 transition-colors">
                    <i className="fas fa-circle-xmark text-lg"></i>
                  </button>
                </div>
              ))}
            </div>

            <button 
              onClick={startPlanning}
              disabled={isAnyProcessing || stagedItems.length === 0}
              className="w-full bg-blue-600 disabled:bg-slate-200 text-white py-5 rounded-2xl font-black text-xl shadow-xl shadow-blue-200 active:scale-95 transition-all mt-4"
            >
              {isAnyProcessing ? '背景批量分析中...' : '規劃送貨路線'}
            </button>
          </div>
        )}

        {/* Route List */}
        <div className="space-y-1">
          {points.map((point) => (
            <DeliveryCard 
              key={point.id} 
              point={point} 
              onComplete={handleComplete}
              onNavigate={handleNavigate}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </main>

      {/* Floating Action Bar */}
      {points.length > 0 && !loading && (
        <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent z-40">
          <div className="flex gap-3 bg-slate-900 p-2 rounded-3xl shadow-2xl">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 bg-white text-slate-900 py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95"
            >
              <i className="fas fa-plus text-blue-600"></i> 拍照
            </button>
            <button 
              onClick={() => setShowAddManual(true)}
              className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95"
            >
              <i className="fas fa-i-cursor"></i> 輸入
            </button>
          </div>
        </div>
      )}

      {/* Planning Loading */}
      {loading && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-12 text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center text-white text-2xl animate-bounce shadow-2xl shadow-blue-200 mb-6">
            <i className="fas fa-route"></i>
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">正在安排首站</h2>
          <p className="text-slate-400 font-bold text-xs tracking-widest uppercase">{loadingMsg}</p>
        </div>
      )}

      {/* Manual Input */}
      {showAddManual && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end justify-center">
          <div className="bg-white w-full max-w-md rounded-t-[3rem] p-10 shadow-2xl animate-in slide-in-from-bottom-32">
            <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8"></div>
            <h3 className="text-2xl font-black text-slate-900 mb-6">新增送貨地址</h3>
            <input 
              autoFocus
              type="text"
              placeholder="輸入街道、大廈名..."
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-5 focus:border-blue-500 focus:bg-white focus:outline-none text-lg font-bold mb-8"
              value={manualAddress}
              onChange={(e) => setManualAddress(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
            />
            <button 
              onClick={handleAddManual}
              disabled={!manualAddress.trim()}
              className="w-full bg-blue-600 disabled:bg-slate-200 text-white py-5 rounded-2xl font-black text-xl shadow-lg active:scale-95 transition-all"
            >
              確認並更新
            </button>
          </div>
        </div>
      )}

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelection} 
        className="hidden" 
        multiple 
        accept="image/*"
        capture="environment"
      />
    </div>
  );
};

export default App;
