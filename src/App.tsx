import React, { useState, useEffect, useMemo } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  Timestamp,
  FirebaseUser,
  OperationType,
  handleFirestoreError
} from './firebase';
import { Transaction, CATEGORIES } from './types';
import { classifyTransaction } from './services/geminiService';
import { cn } from './utils';
import { 
  Plus, 
  LogOut, 
  PieChart, 
  List, 
  TrendingUp, 
  TrendingDown, 
  Trash2, 
  BrainCircuit,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Wallet,
  Calendar,
  X,
  AlertCircle,
  Loader2,
  Mic,
  Lock,
  Clipboard,
  Wifi,
  WifiOff,
  Sparkles,
  XCircle,
  CheckCircle2,
  Info
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart as RePieChart,
  Pie
} from 'recharts';
import { format, startOfMonth, endOfMonth, isSameMonth } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';

// --- Components ---

const getCategoryEmoji = (category: string) => {
  const mapping: { [key: string]: string } = {
    "餐饮美食": "🍱",
    "交通出行": "🚗",
    "购物消费": "🛍️",
    "休闲娱乐": "🎮",
    "医疗保健": "🏥",
    "生活日用": "🏠",
    "住房缴费": "🏢",
    "工资收入": "💰",
    "理财收益": "📈",
    "其他": "📦"
  };
  return mapping[category] || "📦";
};

const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error?.message?.startsWith('{')) {
        setHasError(true);
        setErrorInfo(event.error.message);
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    const info = JSON.parse(errorInfo || '{}');
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
          <h2 className="text-2xl font-bold text-red-600 mb-4">应用出错了</h2>
          <p className="text-gray-600 mb-6">我们遇到了一些权限或数据问题。请尝试刷新页面或重新登录。</p>
          <div className="bg-gray-50 p-4 rounded-lg text-xs font-mono overflow-auto mb-6 max-h-40">
            {JSON.stringify(info, null, 2)}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
          >
            刷新页面
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'list'>('dashboard');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  // Email Login States
  const [loginMode, setLoginMode] = useState<'google' | 'email' | 'register'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const q = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transaction[];
      setTransactions(txs);

      // 如果是新用户（没有交易记录），添加一条欢迎信息
      if (snapshot.empty && user) {
        const welcomeTx = {
          userId: user.uid,
          amount: 0,
          type: 'income',
          category: '其他',
          description: '欢迎使用智能记账！点击下方 + 号开始记录您的第一笔开支。',
          date: Timestamp.now(),
          createdAt: Timestamp.now()
        };
        addDoc(collection(db, 'transactions'), welcomeTx).catch(err => {
          console.error("Failed to add welcome transaction:", err);
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'transactions');
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error("Login failed:", error);
      setAuthError("Google 登录失败，请检查网络或尝试邮箱登录。");
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!email || !password) return;
    
    try {
      if (loginMode === 'register') {
        await createUserWithEmailAndPassword(auth, email, password);
        setFeedback({ type: 'success', text: '注册成功！已为您开启记账之旅。' });
      } else {
        try {
          // 尝试登录
          await signInWithEmailAndPassword(auth, email, password);
        } catch (loginErr: any) {
          // Firebase v9+ 经常返回 'auth/invalid-credential' 涵盖用户不存在和密码错误
          if (loginErr.code === 'auth/user-not-found' || loginErr.code === 'auth/invalid-credential') {
            try {
              // 尝试为新用户注册
              await createUserWithEmailAndPassword(auth, email, password);
              setFeedback({ type: 'success', text: '欢迎新用户！已自动为您创建账号。' });
            } catch (regErr: any) {
              // 如果注册失败且提示邮箱已存在，说明之前的登录失败确实是“密码错误”
              if (regErr.code === 'auth/email-already-in-use') {
                setAuthError("登录失败：密码错误。");
              } else {
                throw regErr;
              }
            }
          } else {
            throw loginErr;
          }
        }
      }
    } catch (error: any) {
      console.error("Auth failed:", error);
      if (error.code === 'auth/operation-not-allowed') {
        setAuthError("服务器未开启邮箱登录功能。请确保在 Firebase 控制台的 Authentication -> Sign-in method 中启用了 'Email/Password'。");
      } else if (error.code === 'auth/invalid-email') {
        setAuthError("邮箱格式不正确，请输入有效的邮箱地址。");
      } else if (error.code === 'auth/weak-password') {
        setAuthError("密码太弱，请至少使用 6 位字符。");
      } else if (error.code === 'auth/network-request-failed') {
        setAuthError("网络请求失败，请检查您的网络连接或 VPN 状态。");
      } else if (error.code === 'auth/too-many-requests') {
        setAuthError("尝试次数过多，账号已暂时锁定，请稍后再试。");
      } else {
        setAuthError(`操作失败: ${error.message || '未知错误'}`);
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Proactive Return Detection (Automatic "Jump")
  // Removed automatic clipboard reading to prevent annoying "Paste" prompts on mobile.
  // Users can now use the manual paste button in the entry modal.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        // We could check for other pending states here if needed
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white p-8 rounded-3xl shadow-2xl border border-slate-100"
        >
          <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200">
            <Wallet className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2 text-center">SmartLedger</h1>
          <p className="text-slate-500 mb-8 text-center">智能记账，理清每一分钱的去向</p>
          
          {authError && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">{authError}</p>
                <p className="opacity-80 leading-relaxed">
                  提示：如果您在弹出窗口看到“无法访问此页面”或域名包含 .cn，通常是由于网络环境限制。建议您直接使用下方的“邮箱登录”，无需验证即可快速使用。
                </p>
              </div>
            </div>
          )}

          {loginMode === 'google' ? (
            <div className="space-y-4">
              <button 
                onClick={handleLogin}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-3"
              >
                <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                使用 Google 账号登录
              </button>
              <button 
                onClick={() => setLoginMode('email')}
                className="w-full py-4 bg-white text-slate-600 border border-slate-200 rounded-2xl font-semibold hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
              >
                使用邮箱登录
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">邮箱地址</label>
                <input 
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">登录密码</label>
                <input 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                {loginMode === 'register' ? '立即注册' : '登录账号'}
              </button>
              <div className="flex items-center justify-between px-1">
                <button 
                  type="button"
                  onClick={() => setLoginMode(loginMode === 'email' ? 'register' : 'email')}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  {loginMode === 'email' ? '没有账号？去注册' : '已有账号？去登录'}
                </button>
                <button 
                  type="button"
                  onClick={() => setLoginMode('google')}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  返回 Google 登录
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50 pb-24 font-['PingFang_SC','Hiragino_Sans_GB','Microsoft_YaHei','ui-sans-serif',system-ui]">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-md shadow-indigo-100">
                <BrainCircuit className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">智能记账</h1>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isOnline ? "bg-emerald-500" : "bg-amber-500"
                  )} />
                  <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                    {isOnline ? "已连接" : "离线模式"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-slate-900">{user.displayName}</p>
                <p className="text-xs text-slate-500">{user.email}</p>
              </div>
              {!isOnline && (
                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg" title="离线模式：数据将稍后同步">
                  <WifiOff className="w-4 h-4" />
                </div>
              )}
              <button 
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-6">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <Dashboard key="dashboard" transactions={transactions} />
            ) : (
              <TransactionListView key="list" transactions={transactions} />
            )}
          </AnimatePresence>
        </main>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-200 px-6 py-3 z-20">
          <div className="max-w-4xl mx-auto flex items-center justify-around relative">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "flex flex-col items-center gap-1 transition-all",
                activeTab === 'dashboard' ? "text-indigo-600" : "text-slate-400"
              )}
            >
              <PieChart className="w-6 h-6" />
              <span className="text-[10px] font-medium">概览</span>
            </button>

            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-indigo-200 -mt-10 border-4 border-white active:scale-95 transition-transform"
            >
              <Plus className="w-8 h-8" />
            </button>

            <button 
              onClick={() => setActiveTab('list')}
              className={cn(
                "flex flex-col items-center gap-1 transition-all",
                activeTab === 'list' ? "text-indigo-600" : "text-slate-400"
              )}
            >
              <List className="w-6 h-6" />
              <span className="text-[10px] font-medium">明细</span>
            </button>
          </div>
        </nav>

        {/* Feedback Toast */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-xl flex items-center gap-3 min-w-[280px]"
              style={{
                backgroundColor: feedback.type === 'error' ? '#FEF2F2' : feedback.type === 'success' ? '#ECFDF5' : '#F0F9FF',
                color: feedback.type === 'error' ? '#991B1B' : feedback.type === 'success' ? '#065F46' : '#075985',
                border: `1px solid ${feedback.type === 'error' ? '#FEE2E2' : feedback.type === 'success' ? '#D1FAE5' : '#E0F2FE'}`
              }}
            >
              {feedback.type === 'error' ? <XCircle className="w-5 h-5" /> : feedback.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              <span className="text-sm font-medium">{feedback.text}</span>
              <button onClick={() => setFeedback(null)} className="ml-auto opacity-50 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add Modal */}
        <AnimatePresence>
          {isAddModalOpen && (
            <AddTransactionModal 
              userId={user.uid} 
              onClose={() => setIsAddModalOpen(false)} 
            />
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

// --- Dashboard View ---

const Dashboard: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
  const currentMonth = new Date();
  
  const stats = useMemo(() => {
    const monthTxs = transactions.filter(t => {
    const d = t.date instanceof Timestamp ? t.date.toDate() : new Date(t.date);
    return isSameMonth(d, currentMonth);
  });
    const income = monthTxs.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = monthTxs.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    
    const categoryData = monthTxs
      .filter(t => t.type === 'expense')
      .reduce((acc: any, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
      }, {});
    
    const pieData = Object.entries(categoryData).map(([name, value]) => ({ name, value }));
    
    // Calculate 6-month history
    const historyData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthStr = format(d, 'yyyy-MM');
      const monthLabel = format(d, 'M月');
      
      const mExpense = transactions
        .filter(t => {
          const d = t.date instanceof Timestamp ? t.date.toDate() : new Date(t.date);
          return t.type === 'expense' && format(d, 'yyyy-MM') === monthStr;
        })
        .reduce((sum, t) => sum + t.amount, 0);
      
      historyData.push({ name: monthLabel, value: mExpense });
    }
    
    return { income, expense, balance: income - expense, pieData, historyData };
  }, [transactions]);

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4'];

  // Custom label for Pie Chart with lines
  const renderCustomizedLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, value, name } = props;
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 20;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="#71717a" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        className="text-[10px] font-medium tracking-tight"
      >
        {`${name}`}
      </text>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-8"
    >
      {/* Summary Section */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">本月结余</p>
          <p className="text-2xl font-bold text-slate-900">¥{stats.balance.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">本月收入</p>
          <p className="text-2xl font-bold text-slate-900">¥{stats.income.toLocaleString()}</p>
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider mb-1">本月支出</p>
          <p className="text-2xl font-bold text-slate-900">¥{stats.expense.toLocaleString()}</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-slate-900">支出分类</h3>
            <PieChart className="w-4 h-4 text-slate-300" />
          </div>
          <div className="h-72">
            {stats.pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={stats.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                    label={renderCustomizedLabel}
                    labelLine={false}
                    stroke="none"
                  >
                    {stats.pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', fontSize: '12px' }}
                  />
                </RePieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-2">
                <PieChart className="w-8 h-8 opacity-20" />
                <span className="text-xs">暂无支出数据</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold text-slate-900">每月趋势</h3>
            <TrendingUp className="w-4 h-4 text-slate-300" />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.historyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                />
                <YAxis hide />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold text-slate-900">最近记录</h3>
          <button className="text-xs font-bold text-indigo-600 hover:text-indigo-700">
            查看全部
          </button>
        </div>
        <div className="divide-y divide-slate-50">
          {transactions.slice(0, 5).map(tx => (
            <TransactionItem key={tx.id} transaction={tx} />
          ))}
          {transactions.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm text-slate-400">还没有记录，点击下方 + 开始记账吧</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// --- Transaction List View ---

const TransactionListView: React.FC<{ transactions: Transaction[] }> = ({ transactions }) => {
  const [viewMode, setViewMode] = useState<'date' | 'category'>('date');
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const d = t.date instanceof Timestamp ? t.date.toDate() : new Date(t.date);
      return isSameMonth(d, selectedMonth);
    });
  }, [transactions, selectedMonth]);

  const groupedByCategory = useMemo(() => {
    const groups: { [key: string]: { txs: Transaction[], total: number, merchants: { [key: string]: number } } } = {};
    filteredTransactions.forEach(tx => {
      const category = tx.category || '其他';
      const merchant = tx.description || '未知商户';
      if (!groups[category]) {
        groups[category] = { txs: [], total: 0, merchants: {} };
      }
      groups[category].txs.push(tx);
      
      const signedAmount = tx.type === 'expense' ? -tx.amount : tx.amount;
      groups[category].total += signedAmount;
      groups[category].merchants[merchant] = (groups[category].merchants[merchant] || 0) + signedAmount;
    });
    return Object.entries(groups).sort((a, b) => b[1].txs.length - a[1].txs.length);
  }, [filteredTransactions]);

  const groupedByDate = useMemo(() => {
    const groups: { [key: string]: { txs: Transaction[], income: number, expense: number } } = {};
    filteredTransactions.forEach(tx => {
      const d = tx.date instanceof Timestamp ? tx.date.toDate() : new Date(tx.date);
      const dateKey = format(d, 'yyyy-MM-dd');
      if (!groups[dateKey]) {
        groups[dateKey] = { txs: [], income: 0, expense: 0 };
      }
      groups[dateKey].txs.push(tx);
      if (tx.type === 'income') groups[dateKey].income += tx.amount;
      else groups[dateKey].expense += tx.amount;
    });
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredTransactions]);

  const changeMonth = (offset: number) => {
    const next = new Date(selectedMonth);
    next.setMonth(next.getMonth() + offset);
    setSelectedMonth(next);
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category) 
        : [...prev, category]
    );
  };

  const monthlyTotals = useMemo(() => {
    const income = filteredTransactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expense = filteredTransactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    return { income, expense, balance: income - expense };
  }, [filteredTransactions]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      {/* Month & View Toggle Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm w-fit">
          <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-50 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-slate-400" />
          </button>
          <span className="text-sm font-bold text-slate-700 min-w-[80px] text-center">
            {format(selectedMonth, 'yyyy年MM月')}
          </span>
          <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-50 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
          <button 
            onClick={() => setViewMode('date')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all",
              viewMode === 'date' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
            )}
          >
            按日期
          </button>
          <button 
            onClick={() => setViewMode('category')}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-bold transition-all",
              viewMode === 'category' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
            )}
          >
            按分类
          </button>
        </div>
      </div>

      {/* Monthly Summary Card */}
      <div className="bg-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl" />
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-indigo-100 text-xs font-medium mb-1">该月总支出</p>
              <h2 className="text-3xl font-bold">¥{monthlyTotals.expense.toLocaleString()}</h2>
            </div>
            <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
              <Wallet className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
            <div>
              <p className="text-indigo-100 text-[10px] uppercase tracking-wider mb-1">总收入</p>
              <p className="font-bold">¥{monthlyTotals.income.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-indigo-100 text-[10px] uppercase tracking-wider mb-1">结余</p>
              <p className="font-bold">¥{monthlyTotals.balance.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">
          {viewMode === 'date' ? '每日消耗' : '分类统计'}
        </h3>
        <span className="text-xs text-slate-400">{filteredTransactions.length} 笔记录</span>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === 'category' ? (
          <motion.div 
            key="category-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            {groupedByCategory.map(([category, data]) => {
              const isExpanded = expandedCategories.includes(category);
              return (
                <div key={category} className="bg-white rounded-[24px] shadow-sm border border-slate-100 overflow-hidden transition-all">
                  <button 
                    onClick={() => toggleCategory(category)}
                    className="w-full p-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center">
                        <span className="text-lg">{getCategoryEmoji(category)}</span>
                      </div>
                      <div className="text-left">
                        <h4 className="font-bold text-slate-900">{category}</h4>
                        <p className="text-xs text-slate-400">{data.txs.length} 笔记录</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "text-sm font-bold",
                        data.total >= 0 ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {data.total >= 0 ? '+' : ''}{data.total.toLocaleString()}
                      </div>
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-slate-300" /> : <ChevronRight className="w-5 h-5 text-slate-300" />}
                    </div>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-slate-50 overflow-hidden"
                      >
                        {/* Merchant Breakdown */}
                        <div className="bg-slate-50/50 p-5 space-y-3 border-b border-slate-50">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">商户/明细分布</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">累计金额</p>
                          </div>
                          <div className="space-y-2">
                            {Object.entries(data.merchants)
                              .sort((a, b) => Math.abs(b[1] as number) - Math.abs(a[1] as number))
                              .map(([name, amount]) => {
                                const val = amount as number;
                                return (
                                  <div key={name} className="flex items-center justify-between text-xs">
                                    <span className="text-slate-600 font-medium">{name}</span>
                                    <span className={cn(
                                      "font-mono font-bold",
                                      val >= 0 ? "text-emerald-500" : "text-slate-900"
                                    )}>
                                      {val >= 0 ? '+' : ''}{val.toLocaleString()}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>

                        {/* Transaction List */}
                        <div className="divide-y divide-slate-50">
                          {data.txs.sort((a, b) => b.date.toMillis() - a.date.toMillis()).map(tx => (
                            <TransactionItem key={tx.id} transaction={tx} showDelete />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </motion.div>
        ) : (
          <motion.div 
            key="date-view"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {groupedByDate.map(([date, data]) => (
              <div key={date} className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <h4 className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                      {format(new Date(date), 'MM月dd日')}
                    </h4>
                  </div>
                  <div className="flex gap-3 text-[10px] font-bold">
                    {data.income > 0 && <span className="text-emerald-500">收 +{data.income}</span>}
                    {data.expense > 0 && <span className="text-rose-500">支 -{data.expense}</span>}
                  </div>
                </div>
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                  {data.txs.map((tx, idx) => (
                    <div key={tx.id} className={cn(idx !== data.txs.length - 1 && "border-b border-slate-50")}>
                      <TransactionItem transaction={tx} showDelete />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {transactions.length === 0 && (
        <div className="text-center py-20">
          <List className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400">暂无交易记录</p>
        </div>
      )}
    </motion.div>
  );
}

const TransactionItem: React.FC<{ transaction: Transaction, showDelete?: boolean }> = ({ transaction, showDelete = false }) => {
  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'transactions', transaction.id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `transactions/${transaction.id}`);
    }
  };

  return (
    <div className="flex items-center justify-between py-4 hover:bg-slate-50 transition-colors group px-2 -mx-2 rounded-xl">
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center text-lg",
          transaction.type === 'income' ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-600"
        )}>
          {getCategoryEmoji(transaction.category)}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">{transaction.description}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{transaction.category}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className={cn(
            "text-sm font-bold",
            transaction.type === 'income' ? "text-emerald-600" : "text-slate-900"
          )}>
            {transaction.type === 'income' ? '+' : '-'}{transaction.amount.toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-300">
            {format(transaction.date instanceof Timestamp ? transaction.date.toDate() : new Date(transaction.date), 'HH:mm')}
          </p>
        </div>
        {showDelete && (
          <button 
            onClick={handleDelete}
            className="p-2 text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// --- Add Transaction Modal ---

function AddTransactionModal({ userId, onClose }: { userId: string, onClose: () => void }) {
  const [input, setInput] = useState('');
  const [isClassifying, setIsClassifying] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [aiSecret, setAiSecret] = useState(localStorage.getItem('ai_secret') || 'cxmyydsjjz');
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [tempSecret, setTempSecret] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success' | 'info', text: string } | null>(null);
  const [formData, setFormData] = useState({
    amount: '',
    type: 'expense' as 'income' | 'expense',
    category: '其他',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  const handleSmartInput = async (textOverride?: string, secretOverride?: string) => {
    const textToProcess = textOverride || input;
    if (!textToProcess || (typeof textToProcess === 'string' && !textToProcess.trim())) return;
    
    console.log("--- AI Recognition Start (v2.0) ---");
    setIsClassifying(true);
    setFeedback(null);
    try {
      let currentSecret = secretOverride || aiSecret || 'cxmyydsjjz';
      const result = await classifyTransaction(textToProcess, currentSecret);
      
      if (result) {
        setFormData(prev => ({
          ...prev,
          amount: result.amount.toString(),
          type: result.type,
          category: CATEGORIES.includes(result.category) ? result.category : '其他',
          description: result.description
        }));
        
        if (!textOverride) setInput('');
        
        if (result._isFallback) {
          setFeedback({ type: 'info', text: 'AI 识别受限，已为您进行基础解析。' });
        } else {
          setFeedback({ type: 'success', text: 'AI 智能解析成功！已自动填入。' });
        }
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (error: any) {
      console.error("Classification error:", error);
      if (error.message === 'INVALID_SECRET') {
        setFeedback({ type: 'error', text: '暗号错误！请重新输入。' });
        localStorage.removeItem('ai_secret');
        setAiSecret('');
      } else if (error.message === 'NETWORK_ERROR') {
        setFeedback({ type: 'error', text: '网络连接失败：无法访问 AI 服务器。请检查您的网络环境（建议开启 VPN）。' });
      } else {
        setFeedback({ type: 'error', text: `识别失败：${error.message || '未知错误'}` });
      }
    } finally {
      setIsClassifying(false);
    }
  };

  const toggleListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setFeedback({ type: 'error', text: '您的浏览器不支持语音识别功能。' });
      return;
    }

    if (isListening) {
      // In most implementations, calling start() again or just letting it end is enough.
      // But we'll just show a message if they click while it's already listening.
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const speechResult = event.results[0][0].transcript;
      setInput(speechResult);
      handleSmartInput(speechResult);
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'no-speech') {
        setFeedback({ type: 'info', text: '未检测到语音，请大声一点。' });
      } else if (event.error === 'not-allowed') {
        setFeedback({ type: 'error', text: '麦克风权限被拒绝，请在浏览器设置中开启。' });
      } else {
        setFeedback({ type: 'error', text: `语音识别出错: ${event.error}` });
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    try {
      recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setIsListening(false);
    }
  };

  // Clipboard Auto-Detection (Pending bill only)
  useEffect(() => {
    const checkPendingBill = () => {
      // Check if there's a pending bill from visibility change (if we still used that)
      const pendingBill = localStorage.getItem('pending_bill');
      if (pendingBill) {
        localStorage.removeItem('pending_bill');
        localStorage.setItem('last_processed_bill', pendingBill);
        handleSmartInput(pendingBill);
      }
    };

    checkPendingBill();
  }, []);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text);
        setFeedback({ type: 'success', text: '已从剪贴板粘贴。' });
        // Optionally auto-trigger recognition
        if (text.includes('¥') || text.includes('元') || text.length > 5) {
          handleSmartInput(text);
        }
      }
    } catch (err) {
      setFeedback({ type: 'error', text: '无法读取剪贴板，请手动粘贴。' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.amount || !formData.description) return;

    try {
      // Parse the date string correctly to avoid UTC offset issues
      const [year, month, day] = formData.date.split('-').map(Number);
      const selectedDate = new Date(year, month - 1, day);
      
      // If the selected date is today, use the current time
      const now = new Date();
      if (format(selectedDate, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')) {
        selectedDate.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
      }

      await addDoc(collection(db, 'transactions'), {
        userId,
        amount: parseFloat(formData.amount),
        type: formData.type,
        category: formData.category,
        description: formData.description,
        date: Timestamp.fromDate(selectedDate),
        createdAt: Timestamp.now()
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="relative bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
      >
        {/* Feedback Message */}
        <AnimatePresence>
          {feedback && (
            <motion.div 
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              className={cn(
                "absolute top-0 left-0 right-0 p-4 z-50 text-center text-sm font-bold shadow-lg",
                feedback.type === 'error' ? "bg-rose-500 text-white" : 
                feedback.type === 'success' ? "bg-emerald-500 text-white" : "bg-indigo-500 text-white"
              )}
            >
              {feedback.text}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">添加交易</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* AI Input Section */}
          <div className="space-y-3">
            <div className="relative">
              <textarea 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="试试输入：中午在麦当劳花了35元"
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[100px] resize-none pr-20"
              />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button
                  type="button"
                  onClick={handlePaste}
                  className="p-2 bg-white text-slate-500 hover:text-indigo-600 rounded-xl shadow-sm border border-slate-100 transition-colors"
                  title="从剪贴板粘贴"
                >
                  <Clipboard className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={toggleListening}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    isListening ? "bg-red-500 text-white animate-pulse" : "bg-white text-slate-500 hover:text-indigo-600 shadow-sm border border-slate-100"
                  )}
                  title={isListening ? "停止录音" : "语音输入"}
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button
              onClick={() => handleSmartInput()}
              disabled={isClassifying || !input.trim()}
              className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-100 transition-all"
            >
              {isClassifying ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <BrainCircuit className="w-5 h-5" />
              )}
              AI 智能识别
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-100"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-slate-400">或手动输入</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">金额</label>
                <input 
                  type="number"
                  step="0.01"
                  required
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-lg font-bold focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">类型</label>
                <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'expense' })}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                      formData.type === 'expense' ? "bg-white text-rose-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    支出
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: 'income' })}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-bold transition-all",
                      formData.type === 'income' ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500"
                    )}
                  >
                    收入
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">分类</label>
              <div className="grid grid-cols-4 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setFormData({ ...formData, category: cat })}
                    className={cn(
                      "py-2 rounded-xl text-[10px] font-bold transition-all border",
                      formData.category === cat 
                        ? "bg-indigo-50 border-indigo-200 text-indigo-600" 
                        : "bg-white border-slate-100 text-slate-500 hover:border-slate-200"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">描述</label>
              <input 
                type="text"
                required
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="去哪儿了？做了什么？"
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">日期</label>
              <input 
                type="date"
                required
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-colors shadow-lg mt-4"
            >
              保存记录
            </button>
          </form>
        </div>
      </motion.div>

      {/* Secret Input Modal */}
      <AnimatePresence>
        {showSecretModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSecretModal(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl"
            >
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center">
                  <Lock className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">AI 密钥设置</h3>
                  <p className="text-xs text-slate-500">请输入您的 Gemini API Key</p>
                </div>
              </div>

              <input 
                type="password"
                value={tempSecret}
                onChange={(e) => setTempSecret(e.target.value)}
                placeholder="API Key..."
                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 mb-6"
              />

              <div className="flex gap-3">
                <button 
                  onClick={() => setShowSecretModal(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={() => {
                    if (tempSecret.trim()) {
                      localStorage.setItem('ai_secret', tempSecret);
                      setAiSecret(tempSecret);
                      setShowSecretModal(false);
                      setTempSecret('');
                    }
                  }}
                  className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
                >
                  保存
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
