import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Zap, 
  BarChart3, 
  Settings, 
  LogOut, 
  LogIn,
  BrainCircuit,
  Clock,
  Activity,
  ChevronRight,
  X
} from 'lucide-react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot, 
  addDoc,
  increment,
  Timestamp,
  User,
  handleFirestoreError,
  OperationType
} from './firebase';
import { getSmartSchedule, getProductivityInsights } from './gemini';
import { cn } from './lib/utils';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

// --- Types ---
interface Task {
  id: string;
  userId: string;
  title: string;
  priority: number;
  energyLevel: number;
  durationMin: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  category: string;
  createdAt: any;
  sortOrder: number;
  uiProperties: {
    bubbleColor: string;
    positionX: number;
    positionY: number;
  };
}

interface Analytics {
  date: string;
  tasksCompleted: number;
  totalEnergyExpended: number;
  focusScore: number;
}

// --- Components ---

const Auth = ({ user, loading }: { user: User | null, loading: boolean }) => {
  if (loading) return <div className="animate-pulse h-8 w-24 bg-slate-200 rounded-full" />;
  
  if (user) {
    return (
      <div className="flex items-center gap-3">
        <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-brand-primary/20" referrerPolicy="no-referrer" />
        <button 
          onClick={() => signOut(auth)}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          title="Logout"
        >
          <LogOut size={18} />
        </button>
      </div>
    );
  }

  return (
    <button 
      onClick={() => signInWithPopup(auth, googleProvider)}
      className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-full hover:bg-blue-600 transition-all shadow-md hover:shadow-lg"
    >
      <LogIn size={18} />
      <span className="font-medium">Login</span>
    </button>
  );
};

const BubbleTask = ({ task, onComplete, onDelete }: { task: Task, onComplete: (id: string) => void, onDelete: (task: Task) => void }) => {
  const size = Math.min(Math.max(task.durationMin * 1.5, 80), 180);
  
  return (
    <motion.div
      layout
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      whileHover={{ scale: 1.05, zIndex: 10 }}
      className={cn(
        "relative rounded-full flex flex-col items-center justify-center p-4 text-center cursor-pointer bubble-shadow group",
        task.status === 'completed' ? "opacity-50 grayscale" : ""
      )}
      style={{ 
        width: size, 
        height: size, 
        backgroundColor: task.uiProperties.bubbleColor,
        color: '#fff'
      }}
    >
      <span className="text-sm font-bold leading-tight line-clamp-2">{task.title}</span>
      <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => { e.stopPropagation(); onComplete(task.id); }}
          className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full"
        >
          <CheckCircle2 size={16} />
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(task); }}
          className="p-1.5 bg-white/20 hover:bg-white/40 rounded-full"
        >
          <Trash2 size={16} />
        </button>
      </div>
      
      {/* Priority Indicator */}
      <div className="absolute -top-1 -right-1 bg-white text-slate-800 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-sm">
        {task.priority}
      </div>
    </motion.div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [energyLevel, setEnergyLevel] = useState(3);
  const [isAdding, setIsAdding] = useState(false);
  const [insights, setInsights] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Form State
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState(3);
  const [newDuration, setNewDuration] = useState(30);
  const [newEnergy, setNewEnergy] = useState(3);
  const [newCategory, setNewCategory] = useState("work");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      return;
    }

    const path = 'tasks';
    const q = query(collection(db, path), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Task));
      // Sort by sortOrder, then by createdAt if sortOrder is equal or missing
      setTasks(taskData.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || (b.createdAt?.seconds - a.createdAt?.seconds)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) {
      setAnalytics(null);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const analyticsId = `${user.uid}_${today}`;
    const path = `analytics/${analyticsId}`;
    
    const unsubscribe = onSnapshot(doc(db, 'analytics', analyticsId), (docSnap) => {
      if (docSnap.exists()) {
        setAnalytics(docSnap.data() as Analytics);
      } else {
        // Initialize today's analytics if it doesn't exist
        setDoc(doc(db, 'analytics', analyticsId), {
          userId: user.uid,
          date: today,
          tasksCompleted: 0,
          totalEnergyExpended: 0,
          focusScore: 0
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, path));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });

    return unsubscribe;
  }, [user]);

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTitle) return;

    const colors = ['#4A90E2', '#50E3C2', '#F5A623', '#D0021B', '#9013FE', '#7ED321'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const path = 'tasks';
    try {
      const maxOrder = tasks.length > 0 ? Math.max(...tasks.map(t => t.sortOrder || 0)) : 0;
      await addDoc(collection(db, path), {
        userId: user.uid,
        title: newTitle,
        priority: newPriority,
        energyLevel: newEnergy,
        durationMin: newDuration,
        status: 'pending',
        category: newCategory,
        createdAt: Timestamp.now(),
        sortOrder: maxOrder + 1,
        uiProperties: {
          bubbleColor: randomColor,
          positionX: Math.random(),
          positionY: Math.random()
        }
      });
      setNewTitle("");
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  const completeTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const path = `tasks/${id}`;
    const taskRef = doc(db, 'tasks', id);
    try {
      await updateDoc(taskRef, { status: 'completed', completedAt: Timestamp.now() });
      
      // Update analytics
      if (user) {
        const today = new Date().toISOString().split('T')[0];
        const analyticsId = `${user.uid}_${today}`;
        const analyticsRef = doc(db, 'analytics', analyticsId);
        await updateDoc(analyticsRef, {
          tasksCompleted: increment(1),
          totalEnergyExpended: increment(task.energyLevel),
          focusScore: increment(5) // Simplified focus score gain
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const deleteTask = (task: Task) => {
    setTaskToDelete(task);
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    const path = `tasks/${taskToDelete.id}`;
    try {
      await deleteDoc(doc(db, 'tasks', taskToDelete.id));
      setTaskToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  const handleSmartReschedule = async () => {
    if (tasks.length === 0 || isRescheduling) return;
    setIsRescheduling(true);
    try {
      const pendingTasksList = tasks.filter(t => t.status === 'pending');
      if (pendingTasksList.length === 0) return;

      const reorderedIds = await getSmartSchedule(pendingTasksList, energyLevel);
      
      // Persist the new order in Firestore
      const updatePromises = reorderedIds.map((id, index) => {
        const taskRef = doc(db, 'tasks', id);
        return updateDoc(taskRef, { sortOrder: index });
      });

      await Promise.all(updatePromises);
      
      const insight = await getProductivityInsights(tasks.filter(t => t.status === 'completed'));
      setInsights(insight);
    } catch (err) {
      console.error("Reschedule failed", err);
    } finally {
      setIsRescheduling(false);
    }
  };

  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  const radarData = useMemo(() => {
    const categories: Record<string, number> = {
      'work': 0,
      'health': 0,
      'learning': 0,
      'social': 0,
      'fun': 0
    };
    
    // Pulse radar shows completed tasks to reflect achievement
    completedTasks.forEach(task => {
      if (categories[task.category] !== undefined) {
        categories[task.category] += 1;
      }
    });

    const max = Math.max(...Object.values(categories), 1);
    
    return Object.entries(categories).map(([subject, count]) => ({
      subject: subject.charAt(0).toUpperCase() + subject.slice(1),
      A: (count / max) * 100,
      fullMark: 100
    }));
  }, [completedTasks]);

  const energyCurveData = useMemo(() => {
    // Generate a curve based on current energy and tasks
    return [
      { name: '8am', val: 30 + (energyLevel * 10) },
      { name: '10am', val: 50 + (energyLevel * 8) },
      { name: '12pm', val: 40 + (energyLevel * 6) },
      { name: '2pm', val: 20 + (energyLevel * 12) },
      { name: '4pm', val: 60 + (energyLevel * 4) },
      { name: '6pm', val: 10 + (energyLevel * 2) },
    ];
  }, [energyLevel]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="glass-morphism sticky top-0 z-50 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center shadow-lg shadow-brand-primary/30">
            <BrainCircuit className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-800">Chronos Flow</h1>
            <p className="text-[10px] font-bold text-brand-primary uppercase tracking-widest">Smart Scheduler</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowStats(!showStats)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
          >
            <BarChart3 size={20} />
          </button>
          <Auth user={user} loading={loading} />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden p-6">
        {!user ? (
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6 animate-pulse-slow">
              <Zap className="text-brand-primary" size={48} />
            </div>
            <h2 className="text-3xl font-black text-slate-800 mb-4">Master Your Time, Reclaim Your Energy</h2>
            <p className="text-slate-500 mb-8">Chronos Flow uses AI to organize your day based on your natural rhythm. Login to start your flow.</p>
            <button 
              onClick={() => signInWithPopup(auth, googleProvider)}
              className="px-8 py-4 bg-brand-primary text-white rounded-2xl font-bold shadow-xl shadow-brand-primary/20 hover:scale-105 transition-transform"
            >
              Get Started with Google
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            {/* Energy & AI Controls */}
            <div className="flex flex-wrap items-center justify-between gap-6 mb-8">
              <div className="glass-morphism p-4 rounded-3xl flex items-center gap-6 shadow-sm border-slate-200/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Zap className="text-amber-500" size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Current Energy</p>
                    <p className="text-sm font-black text-slate-700">{energyLevel}/5</p>
                  </div>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  value={energyLevel} 
                  onChange={(e) => setEnergyLevel(parseInt(e.target.value))}
                  className="w-32 accent-brand-primary"
                />
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={handleSmartReschedule}
                  disabled={isRescheduling}
                  className={cn(
                    "flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                    isRescheduling ? "animate-pulse" : "hover:bg-slate-800"
                  )}
                >
                  {isRescheduling ? (
                    <Activity className="animate-spin" size={18} />
                  ) : (
                    <BrainCircuit size={18} />
                  )}
                  {isRescheduling ? "Optimizing Flow..." : "AI Flow Optimize"}
                </button>
                <button 
                  onClick={() => setIsAdding(true)}
                  className="flex items-center justify-center w-12 h-12 bg-brand-primary text-white rounded-2xl shadow-lg shadow-brand-primary/20 hover:scale-110 transition-all"
                >
                  <Plus size={24} />
                </button>
              </div>
            </div>

            {/* AI Insights Banner */}
            <AnimatePresence>
              {insights && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mb-8 overflow-hidden"
                >
                  <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex gap-4 items-start">
                    <div className="p-2 bg-indigo-500 rounded-lg text-white">
                      <BrainCircuit size={16} />
                    </div>
                    <p className="text-sm text-indigo-900 font-medium italic">"{insights}"</p>
                    <button onClick={() => setInsights("")} className="ml-auto text-indigo-400 hover:text-indigo-600">
                      <X size={16} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bubbles Area */}
            <div className="flex-1 relative min-h-[400px]">
              <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-8 p-4">
                <AnimatePresence mode="popLayout">
                  {pendingTasks.length > 0 ? (
                    pendingTasks.map((task) => (
                      <BubbleTask 
                        key={task.id} 
                        task={task} 
                        onComplete={completeTask} 
                        onDelete={deleteTask} 
                      />
                    ))
                  ) : (
                    <div className="text-center text-slate-300">
                      <Activity size={64} className="mx-auto mb-4 opacity-20" />
                      <p className="font-bold">No pending tasks. Start your flow!</p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Completed Tasks Quick View */}
            {completedTasks.length > 0 && (
              <div className="mt-8">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">Recently Completed</h3>
                <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar">
                  {completedTasks.slice(0, 5).map(task => (
                    <div key={task.id} className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-white border border-slate-100 rounded-full shadow-sm">
                      <CheckCircle2 size={14} className="text-brand-secondary" />
                      <span className="text-xs font-bold text-slate-600 truncate max-w-[120px]">{task.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Task Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl p-8"
            >
              <h2 className="text-2xl font-black text-slate-800 mb-6">New Flow Task</h2>
              <form onSubmit={addTask} className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Task Title</label>
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="What needs to be done?" 
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-brand-primary transition-all font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Priority (1-5)</label>
                    <div className="flex gap-2">
                      {[1,2,3,4,5].map(p => (
                        <button 
                          key={p}
                          type="button"
                          onClick={() => setNewPriority(p)}
                          className={cn(
                            "flex-1 h-10 rounded-xl font-bold transition-all",
                            newPriority === p ? "bg-brand-primary text-white shadow-md" : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                          )}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Duration (Min)</label>
                    <input 
                      type="number" 
                      value={newDuration}
                      onChange={(e) => setNewDuration(parseInt(e.target.value))}
                      className="w-full px-4 py-2 bg-slate-50 border-none rounded-xl focus:ring-2 focus:ring-brand-primary transition-all font-bold text-slate-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Energy Required</label>
                  <div className="flex items-center gap-4">
                    <input 
                      type="range" 
                      min="1" 
                      max="5" 
                      value={newEnergy}
                      onChange={(e) => setNewEnergy(parseInt(e.target.value))}
                      className="flex-1 accent-brand-primary"
                    />
                    <span className="font-black text-brand-primary w-8">{newEnergy}</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Category</label>
                  <div className="flex flex-wrap gap-2">
                    {['work', 'health', 'learning', 'social', 'fun'].map(cat => (
                      <button 
                        key={cat}
                        type="button"
                        onClick={() => setNewCategory(cat)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                          newCategory === cat ? "bg-slate-900 text-white shadow-md" : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                        )}
                      >
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="flex-1 py-4 font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-brand-primary text-white rounded-2xl font-bold shadow-lg shadow-brand-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                  >
                    Add to Flow
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stats Modal */}
      <AnimatePresence>
        {showStats && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowStats(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl p-8 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-slate-800">Productivity Pulse</h2>
                <button onClick={() => setShowStats(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-8">
                {/* Radar Chart */}
                <div className="bg-slate-50 p-6 rounded-[32px]">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Life Balance</h3>
                  <div className="h-[250px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }} />
                        <Radar
                          name="Balance"
                          dataKey="A"
                          stroke="#4A90E2"
                          fill="#4A90E2"
                          fillOpacity={0.5}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Activity Summary */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-blue-50 p-6 rounded-[24px]">
                      <p className="text-[10px] font-black text-blue-400 uppercase mb-1">Tasks Done</p>
                      <p className="text-3xl font-black text-blue-600">{analytics?.tasksCompleted || 0}</p>
                    </div>
                    <div className="bg-emerald-50 p-6 rounded-[24px]">
                      <p className="text-[10px] font-black text-emerald-400 uppercase mb-1">Flow Score</p>
                      <p className="text-3xl font-black text-emerald-600">{Math.min(100, analytics?.focusScore || 0)}</p>
                    </div>
                  </div>

                {/* Productivity Curve */}
                <div className="bg-slate-50 p-6 rounded-[32px]">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Energy Curve</h3>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={energyCurveData}>
                        <defs>
                          <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#4A90E2" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#4A90E2" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <Tooltip />
                        <Area type="monotone" dataKey="val" stroke="#4A90E2" fillOpacity={1} fill="url(#colorVal)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
 
       {/* Confirmation Delete Modal */}
       <AnimatePresence>
         {taskToDelete && (
           <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setTaskToDelete(null)}
               className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
             />
             <motion.div 
               initial={{ scale: 0.9, opacity: 0, y: 20 }}
               animate={{ scale: 1, opacity: 1, y: 0 }}
               exit={{ scale: 0.9, opacity: 0, y: 20 }}
               className="relative w-full max-w-sm bg-white rounded-[32px] shadow-2xl p-8 text-center"
             >
               <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                 <Trash2 className="text-red-500" size={32} />
               </div>
               <h2 className="text-xl font-black text-slate-800 mb-2">Delete Task?</h2>
               <p className="text-slate-500 mb-8 font-medium">Are you sure you want to delete <span className="font-bold text-slate-700">"{taskToDelete.title}"</span>? This action cannot be undone.</p>
               
               <div className="flex gap-3">
                 <button 
                   onClick={() => setTaskToDelete(null)}
                   className="flex-1 py-4 font-bold text-slate-400 hover:text-slate-600 transition-colors"
                 >
                   Keep it
                 </button>
                 <button 
                   onClick={confirmDelete}
                   className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-bold shadow-lg shadow-red-500/20 hover:bg-red-600 active:scale-95 transition-all"
                 >
                   Yes, delete
                 </button>
               </div>
             </motion.div>
           </div>
         )}
       </AnimatePresence>

       {/* Footer / Quick Stats */}
       <footer className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between text-slate-400">
        <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-brand-primary" />
            <span>{pendingTasks.length} Pending</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-brand-secondary" />
            <span>{completedTasks.length} Completed</span>
          </div>
        </div>
        <p className="text-[10px] font-medium">© 2026 Chronos Flow AI</p>
      </footer>
    </div>
  );
}
