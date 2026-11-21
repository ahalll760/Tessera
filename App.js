import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, Image,
  FlatList, SafeAreaView, KeyboardAvoidingView, Platform, 
  StatusBar, Modal, Pressable, Animated, ScrollView, Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_PROVIDERS = [
  {
    id: 'free_tier',
    name: 'Free',
    models: [
      { id: 'openrouter/free', name: 'Auto-Router (Fast)', isVision: true, free: true },
      { id: 'google/gemma-4-26b-a4b-it:free', name: 'Google Gemma 4', isVision: true, free: true },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B', free: true },
      { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1', free: true }
    ]
  },
  {
    id: 'google',
    name: 'Google',
    models: [
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', isVision: true },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', isVision: true },
      { id: 'google/gemma-4-26b-a4b-it:free', name: 'Gemma 4 26B', isVision: true, free: true }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', isVision: true },
      { id: 'openai/gpt-4o', name: 'GPT-4o', isVision: true }
    ]
  },
  {
    id: 'anthropic',
    name: 'Claude',
    models: [
      { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', isVision: true },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', isVision: true }
    ]
  }
];

const STARTER_PROMPTS = [
  { icon: '</>', title: 'Draft code & export file', sub: 'Python, Lua, HTML & more', prompt: 'Create a clean Python script file to organize my downloads folder' },
  { icon: '◎', title: 'Check live weather', sub: 'Real-time global forecast', prompt: "What's the weather looking like today in Paris?" },
  { icon: '⊕', title: 'Search the live web', sub: 'Verified source links', prompt: 'What are the biggest AI & tech news stories right now?', web: true },
  { icon: '✦', title: 'Brainstorm startup ideas', sub: 'Fast product strategy', prompt: 'Give me 3 creative app ideas I can build and launch this week' }
];

const EXT_MAP = { javascript: 'js', js: 'js', jsx: 'jsx', ts: 'ts', python: 'py', py: 'py', lua: 'lua', html: 'html', css: 'css', json: 'json', sql: 'sql', sh: 'sh', md: 'md', txt: 'txt' };
const WMO = { 0:'Clear sky', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast', 45:'Foggy', 48:'Foggy', 51:'Light drizzle', 53:'Drizzle', 61:'Light rain', 63:'Rain', 65:'Heavy rain', 71:'Light snow', 73:'Snow', 80:'Rain showers', 95:'Thunderstorm' };

const fetchLiveWeather = async (rawCity) => {
  try {
    const clean = rawCity.split(',')[0].trim();
    let geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(rawCity)}&count=1&format=json`).then(r => r.json());
    if (!geo?.results?.length) geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=1&format=json`).then(r => r.json());
    if (!geo?.results?.length) return { text: `Location "${rawCity}" not found.`, sources: [] };
    const loc = geo.results[0];
    const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`).then(r => r.json());
    const c = w.current;
    return {
      text: `LIVE WEATHER for ${loc.name}, ${loc.country}: ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C), ${WMO[c.weather_code] || 'Variable'}, Humidity ${c.relative_humidity_2m}%, Wind ${c.wind_speed_10m} km/h. High ${w.daily.temperature_2m_max[0]}°C / Low ${w.daily.temperature_2m_min[0]}°C.`,
      sources: [{ url: `https://open-meteo.com/`, domain: 'open-meteo.com', title: `Open-Meteo (${loc.name})` }]
    };
  } catch { return { text: 'Weather service temporarily unreachable.', sources: [] }; }
};

const fetchWikiSearch = async (query) => {
  try {
    const data = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=&format=json&origin=*`).then(r => r.json());
    const hits = (data?.query?.search || []).slice(0, 3);
    if (!hits.length) return { text: 'No search results found.', sources: [] };
    return {
      text: hits.map(h => `- ${h.title}: ${h.snippet.replace(/<[^>]*>/g, '')}`).join('\n'),
      sources: hits.map(h => ({ url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`, domain: `en.wikipedia.org`, title: h.title }))
    };
  } catch { return { text: 'Search service unreachable.', sources: [] }; }
};

const cleanLinksAndExtractSources = (rawText, annotations = [], extraSources = []) => {
  const sources = [...extraSources];
  const addSource = (url, title) => {
    if (!url || !url.startsWith('http')) return;
    const cleanUrl = url.replace(/[),.;]+$/, '');
    if (!sources.some(s => s.url === cleanUrl)) {
      let domain = cleanUrl;
      try { domain = new URL(cleanUrl).hostname.replace(/^www\./, ''); } catch {}
      sources.push({ url: cleanUrl, domain, title: title || domain });
    }
  };
  (annotations || []).forEach(a => { if (a?.url_citation?.url) addSource(a.url_citation.url, a.url_citation.title); });

  const isDomainOrNum = (lbl) => /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(lbl.trim()) || /^\d+$/.test(lbl.trim());
  const parts = (rawText || '').split(/(```[\s\S]*?```)/g);
  const text = parts.map(part => {
    if (part.startsWith('```')) return part;
    let p = part.replace(/\(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\)/g, (_, lbl, url) => { addSource(url, lbl); return ''; });
    p = p.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, lbl, url) => {
      addSource(url, lbl);
      return isDomainOrNum(lbl) ? '' : lbl;
    });
    p = p.replace(/(https?:\/\/[^\s]+)/g, (url) => { addSource(url); return ''; });
    // Strip standalone orphan domain lines like "wikipedia.org" at the end
    p = p.split('\n').filter(line => !/^([a-z0-9-]+\.)+[a-z]{2,}\.?$/i.test(line.trim())).join('\n');
    return p.replace(/[ \t]{2,}/g, ' ').replace(/\(\s*\)/g, '');
  }).join('').trim();
  return { text, sources };
};

const renderFormattedInline = (str, baseStyle) => {
  return str.split(/(\*\*.*?\*\*)/g).map((s, i) => {
    if (s.startsWith('**') && s.endsWith('**') && s.length > 4) {
      return <Text key={i} style={[baseStyle, { fontWeight: '700', color: '#FFF' }]}>{s.slice(2, -2)}</Text>;
    }
    return <Text key={i} style={baseStyle}>{s.replace(/\*\*/g, '')}</Text>;
  });
};

const renderRichText = (block) => {
  return block.split('\n').map((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return <View key={idx} style={{ height: 8 }} />;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return <View key={idx} style={styles.mdDivider} />;
    const headingMatch = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) return <Text key={idx} style={styles.mdHeading}>{headingMatch[1].replace(/\*\*/g, '')}</Text>;
    const bulletLine = trimmed.replace(/^[-*]\s+/, '• ');
    return <Text key={idx} style={styles.msgText}>{renderFormattedInline(bulletLine, styles.msgText)}</Text>;
  });
};

const downloadFile = (filename, content) => {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const compressImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new window.Image();
    img.onload = () => {
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.65));
    };
    img.onerror = () => reject(new Error('Could not read image.'));
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

const processVideo = (file) => new Promise((resolve, reject) => {
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.preload = 'metadata'; video.muted = true; video.playsInline = true;
  video.onloadedmetadata = async () => {
    if (video.duration > 70) { URL.revokeObjectURL(url); return reject(new Error(`Video is ${Math.ceil(video.duration)}s. Max allowed is 70s.`)); }
    const stamps = [0.15, 0.4, 0.65, 0.88].map(p => Math.min(Math.max(0.1, video.duration - 0.1), video.duration * p));
    const frames = [], canvas = document.createElement('canvas');
    for (const time of stamps) {
      await new Promise((res) => {
        const timer = setTimeout(res, 1500);
        video.onseeked = () => {
          clearTimeout(timer);
          const scale = Math.min(1, 640 / Math.max(video.videoWidth || 640, video.videoHeight || 480));
          canvas.width = (video.videoWidth || 640) * scale; canvas.height = (video.videoHeight || 480) * scale;
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          frames.push(canvas.toDataURL('image/jpeg', 0.6)); res();
        };
        video.currentTime = time;
      });
    }
    URL.revokeObjectURL(url);
    resolve({ frames, duration: Math.round(video.duration) });
  };
  video.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Unsupported video. Try MP4.')); };
  video.src = url; video.load();
});

const EmptyHero = ({ onSelectPrompt, onOpenSettings, hasKey }) => {
  const pulse = useRef(new Animated.Value(0.65)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const fadeUp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeUp, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.65, duration: 1800, useNativeDriver: true })
      ]),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.07, duration: 1800, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 1800, useNativeDriver: true })
      ])
    ])).start();
  }, []);

  return (
    <Animated.View style={[styles.emptyChat, { opacity: fadeUp }]}>
      <Animated.View style={[styles.heroOrb, { opacity: pulse, transform: [{ scale }] }]}>
        <Text style={styles.emptyLogo}>✧</Text>
      </Animated.View>
      <Text style={styles.heroBrand}>Tessarc</Text>
      <Text style={styles.emptyChatText}>One workspace for every frontier AI.</Text>

      <View style={styles.trustStrip}>
        <Text style={styles.trustText}>OpenAI • Claude • Gemini • DeepSeek • Llama</Text>
        <Text style={styles.trustSub}>Local-first privacy • Live Web • Direct file export</Text>
      </View>

      {!hasKey && (
        <TouchableOpacity style={styles.heroPrimaryCta} onPress={onOpenSettings} activeOpacity={0.85}>
          <Text style={styles.heroPrimaryCtaText}>Connect Free API Key →</Text>
        </TouchableOpacity>
      )}

      <View style={styles.starterGrid}>
        {STARTER_PROMPTS.map((item, idx) => (
          <TouchableOpacity key={idx} style={styles.starterCard} onPress={() => onSelectPrompt(item)} activeOpacity={0.75}>
            <Text style={styles.starterIcon}>{item.icon}</Text>
            <Text style={styles.starterTitle}>{item.title}</Text>
            <Text style={styles.starterSub}>{item.sub}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Animated.View>
  );
};

const AnimatedBubble = ({ children, style }) => {
  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(lift, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true })
    ]).start();
  }, []);
  return <Animated.View style={[style, { opacity: fade, transform: [{ translateY: lift }] }]}>{children}</Animated.View>;
};

const ThinkingIndicator = ({ statusText, webActive }) => {
  const fadeAnim = useRef(new Animated.Value(0.35)).current;
  const [stepIdx, setStepIdx] = useState(0);
  const webSteps = ['🌐 Querying web index...', '🌐 Visiting top websites...', '🌐 Reading live pages...', '✧ Synthesizing sources...'];

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 0.35, duration: 600, useNativeDriver: true })
    ])).start();
  }, []);

  useEffect(() => {
    if (!webActive) return;
    const interval = setInterval(() => setStepIdx(i => (i + 1) % webSteps.length), 1400);
    return () => clearInterval(interval);
  }, [webActive]);

  const label = statusText || (webActive ? webSteps[stepIdx] : '✧ Synthesizing...');
  return (
    <View style={styles.thinkingCard}>
      <Animated.Text style={[styles.thinkingText, { opacity: fadeAnim }]}>{label}</Animated.Text>
    </View>
  );
};

const CodeBlock = ({ code, filename, language }) => {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <View style={styles.codeContainer}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLang} numberOfLines={1}>📄 {filename || language}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity onPress={() => { downloadFile(filename, code); setSaved(true); setTimeout(() => setSaved(false), 1800); }} style={styles.copyBtn}>
            <Text style={styles.saveBtnText}>{saved ? 'Saved ✓' : 'Save 💾'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { if (navigator?.clipboard) navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); }} style={styles.copyBtn}>
            <Text style={styles.copyBtnText}>{copied ? 'Copied ✓' : 'Copy'}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.codeScroll}>
        <Text style={styles.codeText}>{code}</Text>
      </ScrollView>
    </View>
  );
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('chat');
  const [showModels, setShowModels] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('free_tier');
  const [modelSearch, setModelSearch] = useState('');
  const [providers, setProviders] = useState(DEFAULT_PROVIDERS);
  const [allLiveModels, setAllLiveModels] = useState([]);
  const [isLiveSynced, setIsLiveSynced] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false); 
  
  const [apiKey, setApiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState(''); 
  const [userContext, setUserContext] = useState('');
  const [savedChats, setSavedChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [editingIndex, setEditingIndex] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState('');
  const [webSearchOn, setWebSearchOn] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_PROVIDERS[0].models[0]); 

  const [attachments, setAttachments] = useState([]);
  const [mediaNotice, setMediaNotice] = useState('');
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const slideAnim = useRef(new Animated.Value(-350)).current;
  const sheetY = useRef(new Animated.Value(500)).current;
  const sheetFade = useRef(new Animated.Value(0)).current;
  const listFade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = 'Tessarc — Multi-Model AI Workspace';
    }

    (async () => {
      try {
        const storedKey = await AsyncStorage.getItem('@council_api_key_v1');
        if (storedKey) setApiKey(storedKey);
        const storedAnthropic = await AsyncStorage.getItem('@council_anthropic_key_v1');
        if (storedAnthropic) setAnthropicKey(storedAnthropic);
        const storedChats = await AsyncStorage.getItem('@council_chats_v1');
        if (storedChats) setSavedChats(JSON.parse(storedChats));
        const storedContext = await AsyncStorage.getItem('@council_context_v1');
        if (storedContext) setUserContext(storedContext);
        const hideNotice = await AsyncStorage.getItem('@council_hide_api_notice');
        if (hideNotice === 'true') setDontShowAgain(true);
        else if (!storedKey && !storedAnthropic) setShowNoticeModal(true);
      } catch (err) {}
    })();

    fetch('https://openrouter.ai/api/v1/models')
      .then(r => r.json())
      .then(json => {
        if (!Array.isArray(json?.data)) return;
        const isFree = (m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0;
        const formatted = json.data.map((m) => ({
          id: m.id,
          name: (m.name || m.id).replace(/^(Google|OpenAI|Anthropic|Meta|DeepSeek|Qwen|Mistral):\s*/i, '').replace(/\s*\(free\)/i, ''),
          isVision: Array.isArray(m.architecture?.input_modalities) ? m.architecture.input_modalities.includes('image') : false,
          free: isFree(m)
        }));
        setAllLiveModels(formatted);

        const freeModels = [{ id: 'openrouter/free', name: 'Auto-Router (Fast)', isVision: true, free: true }, ...formatted.filter(m => m.free && m.id !== 'openrouter/free').slice(0, 20)];
        const googleModels = [
          ...formatted.filter(m => (m.id.startsWith('google/') || m.name.toLowerCase().includes('gemini') || m.name.toLowerCase().includes('hydrogen')) && m.free),
          ...formatted.filter(m => (m.id.startsWith('google/') || m.name.toLowerCase().includes('gemini')) && !m.free)
        ].slice(0, 15);

        const pick = (fn) => formatted.filter(fn).slice(0, 10);
        const liveProviders = [
          { id: 'free_tier', name: 'Free', models: freeModels },
          { id: 'google', name: 'Google', models: googleModels },
          { id: 'openai', name: 'OpenAI', models: pick(m => m.id.startsWith('openai/')) },
          { id: 'anthropic', name: 'Claude', models: pick(m => m.id.startsWith('anthropic/')) },
          { id: 'deepseek', name: 'DeepSeek', models: pick(m => m.id.startsWith('deepseek/')) },
          { id: 'meta', name: 'Meta', models: pick(m => m.id.startsWith('meta-llama/')) },
          { id: 'alibaba', name: 'Qwen', models: pick(m => m.id.startsWith('qwen/')) }
        ].filter(p => p.models.length > 0);

        if (liveProviders.length > 0) { setProviders(liveProviders); setIsLiveSynced(true); }
      })
      .catch(() => {});
  }, []);

  const handleApiKeyChange = async (key) => { setApiKey(key); try { await AsyncStorage.setItem('@council_api_key_v1', key.trim()); } catch (e) {} };
  const handleAnthropicKeyChange = async (key) => { setAnthropicKey(key); try { await AsyncStorage.setItem('@council_anthropic_key_v1', key.trim()); } catch (e) {} };
  const handleContextChange = async (text) => { setUserContext(text); try { await AsyncStorage.setItem('@council_context_v1', text); } catch (e) {} };
  const toggleDontShowAgain = async () => { const v = !dontShowAgain; setDontShowAgain(v); try { await AsyncStorage.setItem('@council_hide_api_notice', v ? 'true' : 'false'); } catch (e) {} };
  const syncChatsWithStorage = async (list) => { setSavedChats(list); try { await AsyncStorage.setItem('@council_chats_v1', JSON.stringify(list)); } catch (e) {} };

  const openMenu = () => { setIsModalVisible(true); Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }).start(); };
  const closeMenu = () => { Animated.timing(slideAnim, { toValue: -350, duration: 220, useNativeDriver: true }).start(() => setIsModalVisible(false)); };

  const openModelSheet = () => {
    setModelSearch(''); setShowModels(true); sheetY.setValue(500); sheetFade.setValue(0);
    Animated.parallel([
      Animated.timing(sheetFade, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(sheetY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true })
    ]).start();
  };

  const closeModelSheet = () => {
    Animated.parallel([
      Animated.timing(sheetFade, { toValue: 0, duration: 160, useNativeDriver: true }),
      Animated.timing(sheetY, { toValue: 500, duration: 200, useNativeDriver: true })
    ]).start(() => setShowModels(false));
  };

  const switchCompanyTab = (id) => {
    setSelectedCompanyId(id); listFade.setValue(0.3);
    Animated.timing(listFade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  };

  const startNewChat = () => { setActiveChatId(null); setMessages([]); setInputText(''); setAttachments([]); setEditingIndex(null); closeMenu(); };
  const selectChat = (chat) => { setActiveChatId(chat.id); setMessages(chat.messages); setAttachments([]); setEditingIndex(null); closeMenu(); };

  const deleteChat = async (id, e) => {
    e.stopPropagation();
    const updated = savedChats.filter(c => c.id !== id);
    if (activeChatId === id) { setActiveChatId(null); setMessages([]); setEditingIndex(null); }
    await syncChatsWithStorage(updated);
  };

  const startEdit = (index) => {
    const target = messages[index];
    if (!target || target.role !== 'user') return;
    setEditingIndex(index); setInputText(target.content || '');
    setAttachments(target.images?.length ? target.images.map((uri, i) => ({ type: 'image', preview: uri, frames: [uri], label: `Media ${i + 1}` })) : []);
  };

  const cancelEdit = () => { setEditingIndex(null); setInputText(''); setAttachments([]); };

  const handleSelectStarter = (item) => {
    setInputText(item.prompt);
    if (item.web) setWebSearchOn(true);
  };

  const handlePickMedia = () => {
    setMediaNotice('');
    if (typeof document === 'undefined') { setMediaNotice('⚠️ Media attachments work on tessarc.vercel.app web.'); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*,video/*';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (file.type.startsWith('image/')) {
          setMediaNotice('Compressing image...');
          const compressed = await compressImage(file);
          setAttachments(prev => [...prev, { type: 'image', preview: compressed, frames: [compressed], label: 'Photo' }]);
          setMediaNotice('');
        } else if (file.type.startsWith('video/')) {
          setMediaNotice('Extracting frames (70s max)...');
          const { frames, duration } = await processVideo(file);
          setAttachments(prev => [...prev, { type: 'video', preview: frames[0], frames, label: `🎬 ${duration}s` }]);
          setMediaNotice('');
        } else { setMediaNotice('⚠️ Select an image or video.'); }
      } catch (err) { setMediaNotice(`⚠️ ${err.message}`); }
    };
    input.click();
  };

  const sendMessage = async () => {
    if (!inputText.trim() && attachments.length === 0) return;
    setMediaNotice('');
    const currentId = activeChatId || Date.now().toString();
    if (!activeChatId) setActiveChatId(currentId);

    const allFrames = attachments.flatMap(a => a.frames);
    const hasVideo = attachments.some(a => a.type === 'video');
    const userText = inputText.trim() || (hasVideo ? 'What is happening in this video?' : 'Analyze this image.');
    
    const newUserMsg = { role: 'user', content: userText, images: allFrames };
    const baseHistory = editingIndex !== null ? messages.slice(0, editingIndex) : messages;
    const chatHistory = [...baseHistory, newUserMsg];

    setMessages(chatHistory); setInputText(''); setAttachments([]); setEditingIndex(null);
    setThinkingStatus('');
    setIsLoading(true);

    const isClaudeModel = selectedModel.id.includes('claude');
    if (isClaudeModel && !anthropicKey.trim() && !apiKey.trim()) {
      setMessages([...chatHistory, { role: 'assistant', content: '⚠️ Add an Anthropic or OpenRouter Key in Settings.' }]);
      return setIsLoading(false);
    }
    if (!isClaudeModel && !apiKey.trim()) {
      setMessages([...chatHistory, { role: 'assistant', content: '⚠️ Add your OpenRouter API key in Settings (☰ > ⚙ Settings).' }]);
      return setIsLoading(false);
    }

    const attemptFetch = async (msgsToSend, useWebPlugin) => {
      const now = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' });
      let systemPrompt = `You are Tessarc, a witty, charismatic AI powered by ${selectedModel.name}. Current date/time: ${now}. Always reply strictly in the exact language the user used. Use emojis naturally 😂✨. If the user just greets you (like "Hello"), greet them back warmly—do NOT search or bring up unrelated trivia. When creating files/code, put the filename in the code header like \`\`\`lua:speed.lua. NEVER write website domain names (like wikipedia.org) or raw URLs in your reply text—sources are displayed separately by the UI.\nLIVE TOOLS: If asked for current weather/forecast in a city and you don't already have it, reply ONLY with: [[WEATHER:CityName]]. If asked for factual lookups you aren't sure about, reply ONLY with: [[SEARCH:query]].`;
      if (userContext.trim() !== '') systemPrompt += `\nUser Context: ${userContext}`;

      if (isClaudeModel && anthropicKey.trim()) {
        const formattedMsgs = msgsToSend.map(m => m.images?.length ? ({
          role: m.role,
          content: [...m.images.map(url => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: url.split(',')[1] } })), { type: 'text', text: m.content }]
        }) : ({ role: m.role, content: m.content }));

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": anthropicKey.trim(), "anthropic-version": "2023-06-05", "content-type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model: selectedModel.id.includes('3.7') ? 'claude-3-7-sonnet-20250219' : 'claude-3-5-sonnet-20241022', max_tokens: 4000, system: systemPrompt, messages: formattedMsgs })
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data?.error?.message || 'Anthropic API Error');
        return { raw: data.content[0].text, annotations: [] };
      }

      const openRouterMsgs = msgsToSend.map(m => m.images?.length ? ({
        role: m.role,
        content: [{ type: 'text', text: m.content }, ...m.images.map(url => ({ type: 'image_url', image_url: { url } }))]
      }) : ({ role: m.role, content: m.content }));

      const body = { model: selectedModel.id, messages: [{ role: "system", content: systemPrompt }, ...openRouterMsgs] };
      if (useWebPlugin && allFrames.length === 0) body.plugins = [{ id: 'web', max_results: 3 }];

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey.trim() || anthropicKey.trim()}`, "Content-Type": "application/json", "HTTP-Referer": "https://tessarc.vercel.app", "X-Title": "Tessarc" },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data?.error?.message || 'API Error');
      return { raw: data.choices[0].message.content, annotations: data.choices[0].message.annotations || [] };
    };

    try {
      let result;
      try {
        result = await attemptFetch(chatHistory, webSearchOn);
      } catch (webErr) {
        if (webSearchOn && (webErr.message.includes('402') || webErr.message.toLowerCase().includes('credit'))) {
          setThinkingStatus('🌐 Switching to free web lookup...');
          result = await attemptFetch(chatHistory, false);
        } else { throw webErr; }
      }

      let extraSources = [];
      const weatherMatch = result.raw.match(/\[\[WEATHER:(.*?)\]\]/i);
      const searchMatch = result.raw.match(/\[\[SEARCH:(.*?)\]\]/i);

      if (weatherMatch) {
        const city = weatherMatch[1].trim();
        setThinkingStatus(`🌐 Visiting open-meteo.com (${city})...`);
        const liveData = await fetchLiveWeather(city);
        extraSources = liveData.sources;
        setThinkingStatus(`✧ Synthesizing forecast...`);
        result = await attemptFetch([...chatHistory, { role: 'assistant', content: result.raw }, { role: 'user', content: `[SYSTEM LIVE DATA - DO NOT OUTPUT TAGS]\n${liveData.text}\nAnswer the user naturally with this live weather!` }], false);
      } else if (searchMatch) {
        const q = searchMatch[1].trim();
        setThinkingStatus(`🌐 Visiting en.wikipedia.org (${q})...`);
        const wikiData = await fetchWikiSearch(q);
        extraSources = wikiData.sources;
        setThinkingStatus(`✧ Reading Wikipedia pages...`);
        result = await attemptFetch([...chatHistory, { role: 'assistant', content: result.raw }, { role: 'user', content: `[SYSTEM SEARCH DATA - DO NOT OUTPUT TAGS]\n${wikiData.text}\nAnswer the user naturally with this info!` }], false);
      }

      const cleaned = cleanLinksAndExtractSources(result.raw, result.annotations, extraSources);
      const finalHistory = [...chatHistory, { role: 'assistant', content: cleaned.text, sources: cleaned.sources }];
      setMessages(finalHistory);
      saveSessionToHistory(currentId, finalHistory);
    } catch (e) {
      const tip = allFrames.length > 0 ? '\n\n💡 Tip: Ensure your selected model supports Vision (👁).' : '';
      setMessages([...chatHistory, { role: 'assistant', content: `⚠️ Error: ${e.message}${tip}` }]);
    } finally {
      setIsLoading(false);
      setThinkingStatus('');
    }
  };

  const saveSessionToHistory = (chatId, updatedMessages) => {
    let list = [...savedChats];
    const firstUserMsg = updatedMessages.find(m => m.role === 'user');
    const autoTitle = firstUserMsg ? firstUserMsg.content.slice(0, 28) : 'Conversation';
    const index = list.findIndex(c => c.id === chatId);
    if (index >= 0) list[index] = { ...list[index], messages: updatedMessages };
    else list.unshift({ id: chatId, title: autoTitle, messages: updatedMessages });
    syncChatsWithStorage(list);
  };

  const renderMessageContent = (item) => {
    const parts = (item.content || '').split(/(```[\s\S]*?```)/g);
    return (
      <View>
        {item.images?.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {item.images.map((uri, idx) => <Image key={idx} source={{ uri }} style={styles.msgImageThumb} />)}
          </ScrollView>
        )}
        {parts.map((part, index) => {
          if (part.startsWith('```') && part.endsWith('```')) {
            const firstBreak = part.indexOf('\n');
            let lang = 'txt', filename = 'tessarc-file.txt', code = '';
            if (firstBreak !== -1) {
              const [rawLang, rawFile] = part.slice(3, firstBreak).trim().split(':');
              lang = (rawLang || 'txt').trim().toLowerCase();
              filename = rawFile ? rawFile.trim() : `tessarc-file.${EXT_MAP[lang] || 'txt'}`;
              code = part.slice(firstBreak + 1, -3).trim();
            } else { code = part.slice(3, -3).trim(); }
            return <CodeBlock key={index} code={code} filename={filename} language={lang} />;
          }
          return part.trim() ? <View key={index}>{renderRichText(part)}</View> : null;
        })}
        {item.sources?.length > 0 && (
          <View style={styles.sourcesWrap}>
            <Text style={styles.sourcesLabel}>VISITED SOURCES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {item.sources.map((s, idx) => (
                <TouchableOpacity key={idx} style={styles.sourcePill} onPress={() => Linking.openURL(s.url)} activeOpacity={0.7}>
                  <Text style={styles.sourcePillText} numberOfLines={1}>🌐 {s.domain} ↗</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  if (currentScreen === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.header}>
          <View style={styles.headerInner}>
            <TouchableOpacity onPress={() => setCurrentScreen('chat')}><Text style={styles.headerIcon}>←</Text></TouchableOpacity>
            <Text style={styles.headerTitle}>Settings</Text>
            <View style={{width: 30}} />
          </View>
        </View>
        <ScrollView style={styles.settingsContent} contentContainerStyle={styles.desktopCenter}>
          <Text style={styles.sectionLabel}>OPENROUTER API KEY</Text>
          <Text style={styles.helperText}>Unlocks Free models, Gemini, Hydrogen, GPT-4o, DeepSeek & Llama.</Text>
          <TextInput style={styles.keyInput} value={apiKey} onChangeText={handleApiKeyChange} placeholder="sk-or-v1-..." placeholderTextColor="#666" autoCapitalize="none" autoCorrect={false} />
          <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL('https://openrouter.ai/keys')}><Text style={styles.linkButtonText}>Get OpenRouter Key ↗</Text></TouchableOpacity>
          <View style={{height: 10}} />
          <Text style={styles.sectionLabel}>ANTHROPIC (CLAUDE) API KEY</Text>
          <Text style={styles.helperText}>Optional direct native key for Claude 3.7 Sonnet.</Text>
          <TextInput style={styles.keyInput} value={anthropicKey} onChangeText={handleAnthropicKeyChange} placeholder="sk-ant-..." placeholderTextColor="#666" autoCapitalize="none" autoCorrect={false} />
          <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}><Text style={styles.linkButtonText}>Get Anthropic Claude Key ↗</Text></TouchableOpacity>
          <View style={{height: 20}} />
          <Text style={styles.sectionLabel}>CUSTOM INSTRUCTIONS</Text>
          <TextInput style={styles.contextInput} value={userContext} onChangeText={handleContextChange} multiline placeholder="e.g., Explain things simply..." placeholderTextColor="#666" />
          <View style={{height: 60}} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const activeProvider = providers.find(p => p.id === selectedCompanyId) || providers[0];
  const displayedModels = modelSearch.trim()
    ? (allLiveModels.length > 0 ? allLiveModels : providers.flatMap(p => p.models))
        .filter(m => m.name.toLowerCase().includes(modelSearch.toLowerCase()) || m.id.toLowerCase().includes(modelSearch.toLowerCase()))
        .slice(0, 25)
    : activeProvider.models;
  const hasAnyKey = Boolean(apiKey.trim() || anthropicKey.trim());
  const canSend = (inputText.trim().length > 0 || attachments.length > 0) && !isLoading;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <TouchableOpacity onPress={openMenu}><Text style={styles.headerIcon}>☰</Text></TouchableOpacity>
          <TouchableOpacity onPress={openModelSheet} style={styles.modelBtn} activeOpacity={0.7}>
            <View style={[styles.liveDot, { backgroundColor: selectedModel.free ? '#4ADE80' : '#4A90E2' }]} />
            <Text style={styles.modelBtnText} numberOfLines={1}>{selectedModel.name}</Text>
            <Text style={styles.modelBtnChevron}>▾</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={startNewChat}><Text style={styles.headerIcon}>＋</Text></TouchableOpacity>
        </View>
      </View>

      <Modal visible={showNoticeModal && !hasAnyKey && !dontShowAgain} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.noticeCard}>
            <Text style={styles.noticeHeader}>🔑 Setup Required</Text>
            <Text style={styles.noticeBody}>To chat with models, please add an OpenRouter or Anthropic API key in Settings.</Text>
            <TouchableOpacity style={styles.noticeBtnPrimary} onPress={() => { setShowNoticeModal(false); setCurrentScreen('settings'); }}><Text style={styles.noticeBtnPrimaryText}>Go to Settings ⚙</Text></TouchableOpacity>
            <TouchableOpacity style={styles.noticeBtnSecondary} onPress={() => Linking.openURL('https://openrouter.ai/keys')}><Text style={styles.noticeBtnSecondaryText}>Get OpenRouter Key ↗</Text></TouchableOpacity>
            <TouchableOpacity style={styles.checkboxContainer} onPress={toggleDontShowAgain}>
              <View style={[styles.checkboxBox, dontShowAgain && styles.checkboxChecked]}>{dontShowAgain && <Text style={styles.checkboxCheck}>✓</Text>}</View>
              <Text style={styles.checkboxLabel}>Don't show this again</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.noticeDismiss} onPress={() => setShowNoticeModal(false)}><Text style={styles.noticeDismissText}>Dismiss</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showModels} transparent animationType="none" onRequestClose={closeModelSheet}>
        <Animated.View style={[styles.sheetBackdrop, { opacity: sheetFade }]}>
          <Pressable style={{ flex: 1 }} onPress={closeModelSheet} />
          <Animated.View style={[styles.sheetContainer, { transform: [{ translateY: sheetY }] }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.sheetTitle}>Select Model</Text>
                {isLiveSynced && <View style={styles.liveBadge}><Text style={styles.liveBadgeText}>● Live</Text></View>}
              </View>
              <TouchableOpacity onPress={closeModelSheet} style={styles.sheetClosePill}><Text style={styles.dropdownCloseBtn}>✕</Text></TouchableOpacity>
            </View>
            <TextInput style={styles.sheetSearchInput} value={modelSearch} onChangeText={setModelSearch} placeholder="Search all models (hydrogen, gemini, claude)..." placeholderTextColor="#777" autoCapitalize="none" />
            {!modelSearch.trim() && (
              <View style={styles.companyTabsWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
                  {providers.map((p) => {
                    const active = p.id === activeProvider.id;
                    return (
                      <TouchableOpacity key={p.id} onPress={() => switchCompanyTab(p.id)} style={[styles.companyPill, active && styles.companyPillActive]}>
                        <Text style={[styles.companyPillText, active && styles.companyPillTextActive]}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            <Animated.ScrollView style={[styles.sheetList, { opacity: listFade }]} showsVerticalScrollIndicator={false}>
              {displayedModels.length === 0 ? (
                <Text style={styles.emptySearchText}>No models found for "{modelSearch}"</Text>
              ) : (
                displayedModels.map((m) => {
                  const isSelected = selectedModel.id === m.id;
                  return (
                    <TouchableOpacity key={m.id} style={[styles.modelCard, isSelected && styles.modelCardActive]} onPress={() => { setSelectedModel(m); closeModelSheet(); }} activeOpacity={0.75}>
                      <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={[styles.modelCardTitle, isSelected && { color: '#FFF' }]} numberOfLines={1}>{m.name}</Text>
                        <Text style={styles.modelCardSub} numberOfLines={1}>{m.id}</Text>
                      </View>
                      <View style={styles.modelBadges}>
                        {m.isVision && <View style={styles.visionBadge}><Text style={styles.visionBadgeText}>👁</Text></View>}
                        {m.free && <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>FREE</Text></View>}
                        {isSelected && <Text style={styles.checkmark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              <View style={{ height: 30 }} />
            </Animated.ScrollView>
          </Animated.View>
        </Animated.View>
      </Modal>

      <Modal visible={isModalVisible} transparent animationType="fade">
        <View style={styles.menuOverlay}>
          <Animated.View style={[styles.menuContent, { transform: [{ translateX: slideAnim }] }]}>
            <TouchableOpacity style={styles.newChatBtn} onPress={startNewChat}><Text style={styles.newChatBtnText}>＋ New Chat</Text></TouchableOpacity>
            <Text style={styles.historyHeading}>RECENTS</Text>
            <ScrollView style={styles.chatListScroll} showsVerticalScrollIndicator={false}>
              {savedChats.length === 0 ? <Text style={styles.emptyHistoryText}>No chats yet.</Text> : savedChats.map(c => (
                <TouchableOpacity key={c.id} style={[styles.historyItem, activeChatId === c.id && styles.activeHistoryItem]} onPress={() => selectChat(c)}>
                  <Text style={[styles.historyItemText, activeChatId === c.id && styles.activeHistoryItemText]} numberOfLines={1}>{c.title}</Text>
                  <TouchableOpacity onPress={(e) => deleteChat(c.id, e)} style={styles.deleteBtn}><Text style={styles.deleteBtnText}>✕</Text></TouchableOpacity>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.menuFooter}><TouchableOpacity style={styles.settingsRow} onPress={() => { closeMenu(); setCurrentScreen('settings'); }}><Text style={styles.settingsRowText}>⚙ Settings</Text></TouchableOpacity></View>
          </Animated.View>
          <Pressable style={styles.menuCloseArea} onPress={closeMenu} />
        </View>
      </Modal>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={{ flex: 1 }}>
        <FlatList
          key="chat-list"
          data={isLoading ? [...messages, { role: 'thinking' }] : messages}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item, index }) => {
            if (item.role === 'thinking') return <ThinkingIndicator statusText={thinkingStatus} webActive={webSearchOn} />;
            const isUser = item.role === 'user';
            return (
              <AnimatedBubble style={isUser ? styles.userMsgWrap : styles.aiMsg}>
                <View style={isUser ? [styles.userMsg, editingIndex === index && styles.editingBubble] : null}>{renderMessageContent(item)}</View>
                {isUser && !isLoading && (
                  <TouchableOpacity onPress={() => startEdit(index)} style={styles.editTrigger}><Text style={styles.editTriggerText}>✎ Edit</Text></TouchableOpacity>
                )}
              </AnimatedBubble>
            );
          }}
          contentContainerStyle={[styles.chatScrollContent, styles.desktopCenter]}
          ListEmptyComponent={() => <EmptyHero onSelectPrompt={handleSelectStarter} onOpenSettings={() => setCurrentScreen('settings')} hasKey={hasAnyKey} />}
        />

        {mediaNotice ? <Text style={[styles.mediaNoticeText, styles.desktopCenter]}>{mediaNotice}</Text> : null}

        {editingIndex !== null && (
          <View style={[styles.editingBanner, styles.desktopCenter]}>
            <Text style={styles.editingBannerText}>✎ Editing message (rewinds chat below)</Text>
            <TouchableOpacity onPress={cancelEdit}><Text style={styles.editingCancelText}>Cancel ✕</Text></TouchableOpacity>
          </View>
        )}

        {attachments.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.previewBar, styles.desktopCenter]}>
            {attachments.map((att, idx) => (
              <View key={idx} style={styles.previewCard}>
                <Image source={{ uri: att.preview }} style={styles.previewThumb} />
                <Text style={styles.previewLabel}>{att.label}</Text>
                <TouchableOpacity onPress={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} style={styles.removeAttBtn}><Text style={styles.removeAttText}>✕</Text></TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={styles.inputOuter}>
          <View style={[styles.inputContainer, styles.desktopCenter]}>
            <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia}><Text style={styles.attachTxt}>📎</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.attachBtn, webSearchOn && styles.webBtnActive]} onPress={() => setWebSearchOn(!webSearchOn)}>
              <Text style={styles.attachTxt}>🌐</Text>
            </TouchableOpacity>
            <TextInput style={styles.input} value={inputText} onChangeText={setInputText} placeholder={editingIndex !== null ? "Edit your message..." : "Ask Tessarc anything..."} placeholderTextColor="#999" />
            <TouchableOpacity style={[styles.sendBtn, !canSend && styles.sendBtnIdle, editingIndex !== null && { backgroundColor: '#4A90E2' }]} onPress={sendMessage} disabled={!canSend}>
              <Text style={[styles.sendTxt, { color: editingIndex !== null ? '#FFF' : (canSend ? '#000' : '#BBB') }]}>{editingIndex !== null ? '✓' : '↑'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  desktopCenter: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { borderBottomWidth: 1, borderBottomColor: '#16161C', paddingVertical: 12 },
  headerInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, width: '100%', maxWidth: 820, alignSelf: 'center' },
  headerIcon: { color: '#FFF', fontSize: 24, padding: 5 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  modelBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181E', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24, maxWidth: 235, borderWidth: 1, borderColor: '#343440' },
  liveDot: { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  modelBtnText: { color: '#FFF', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  modelBtnChevron: { color: '#AAA', fontSize: 12, marginLeft: 6 },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end', alignItems: 'center' },
  sheetContainer: { backgroundColor: '#111114', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: '#27272C', height: '78%', width: '100%', maxWidth: 640, paddingTop: 10 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#3A3A40', alignSelf: 'center', marginBottom: 12, flexShrink: 0 },
  sheetHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12, flexShrink: 0 },
  sheetTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  liveBadge: { backgroundColor: '#112E1D', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: '#1E4D31' },
  liveBadgeText: { color: '#4ADE80', fontSize: 10, fontWeight: '800' },
  sheetClosePill: { backgroundColor: '#1D1D22', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  dropdownCloseBtn: { color: '#AAA', fontSize: 13, fontWeight: 'bold' },
  sheetSearchInput: { backgroundColor: '#1A1A1F', color: '#FFF', fontSize: 14, marginHorizontal: 16, marginBottom: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: '#2E2E36', flexShrink: 0 },
  companyTabsWrap: { height: 46, flexShrink: 0, marginBottom: 8, justifyContent: 'center' },
  companyPill: { backgroundColor: '#1B1B20', paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#2E2E36', justifyContent: 'center', alignItems: 'center' },
  companyPillActive: { backgroundColor: '#FFF', borderColor: '#FFF' },
  companyPillText: { color: '#BBB', fontSize: 13, fontWeight: '600' },
  companyPillTextActive: { color: '#000', fontWeight: '800' },
  sheetList: { flex: 1, paddingHorizontal: 16 },
  emptySearchText: { color: '#666', fontSize: 14, textAlign: 'center', padding: 30 },
  modelCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#17171B', padding: 14, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: '#222228' },
  modelCardActive: { backgroundColor: '#1E2330', borderColor: '#4A90E2' },
  modelCardTitle: { color: '#E2E2E6', fontSize: 15, fontWeight: '600', marginBottom: 2 },
  modelCardSub: { color: '#66666E', fontSize: 11 },
  modelBadges: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  visionBadge: { backgroundColor: '#22222A', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  visionBadgeText: { fontSize: 11 },
  freeBadge: { backgroundColor: '#123321', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  freeBadgeText: { color: '#4ADE80', fontSize: 10, fontWeight: '800' },
  checkmark: { color: '#4A90E2', fontSize: 15, fontWeight: 'bold', marginLeft: 4 },
  menuOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)' },
  menuContent: { width: '80%', maxWidth: 320, backgroundColor: '#0A0A0A', padding: 20, paddingTop: 50, borderRightWidth: 1, borderRightColor: '#222' },
  menuCloseArea: { flex: 1 }, 
  newChatBtn: { backgroundColor: '#FFF', paddingVertical: 14, borderRadius: 100, alignItems: 'center', marginBottom: 25 },
  newChatBtnText: { color: '#000', fontSize: 16, fontWeight: '800' },
  historyHeading: { color: '#666', fontSize: 11, fontWeight: '800', marginBottom: 15 },
  chatListScroll: { flex: 1 },
  emptyHistoryText: { color: '#444', fontSize: 14, fontStyle: 'italic' },
  historyItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderRadius: 12, marginBottom: 6 },
  activeHistoryItem: { backgroundColor: '#1A1A1A' },
  historyItemText: { color: '#BBB', fontSize: 15, flex: 1 },
  activeHistoryItemText: { color: '#FFF', fontWeight: '600' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: '#555', fontSize: 12 },
  menuFooter: { borderTopWidth: 1, borderTopColor: '#222', paddingTop: 15 },
  settingsRowText: { color: '#FFF', fontSize: 16 },
  settingsContent: { padding: 20 },
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  helperText: { color: '#777', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  keyInput: { backgroundColor: '#111', color: '#FFF', fontSize: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#2C2C34', marginBottom: 12 },
  linkButton: { backgroundColor: '#1C1C1E', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#333', marginBottom: 16 },
  linkButtonText: { color: '#4A90E2', fontSize: 14, fontWeight: '700' },
  contextInput: { backgroundColor: '#111', color: '#FFF', fontSize: 15, minHeight: 120, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#2C2C34', textAlignVertical: 'top' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 25 },
  noticeCard: { backgroundColor: '#141416', width: '100%', maxWidth: 400, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: '#252528' },
  noticeHeader: { color: '#FFF', fontSize: 19, fontWeight: '800', marginBottom: 10 },
  noticeBody: { color: '#AAA', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  noticeBtnPrimary: { backgroundColor: '#FFF', paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  noticeBtnPrimaryText: { color: '#000', fontSize: 15, fontWeight: '700' },
  noticeBtnSecondary: { backgroundColor: '#202024', paddingVertical: 13, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#333', marginBottom: 16 },
  noticeBtnSecondaryText: { color: '#4A90E2', fontSize: 14, fontWeight: '700' },
  checkboxContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkboxBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: '#555', marginRight: 10, justifyContent: 'center', alignItems: 'center' },
  checkboxChecked: { backgroundColor: '#4A90E2', borderColor: '#4A90E2' },
  checkboxCheck: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  checkboxLabel: { color: '#888', fontSize: 13 },
  noticeDismiss: { alignItems: 'center', paddingVertical: 6 },
  noticeDismissText: { color: '#666', fontSize: 13, fontWeight: '600' },
  chatScrollContent: { padding: 20, flexGrow: 1, justifyContent: 'flex-end' },
  emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 },
  heroOrb: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#14141A', borderWidth: 1, borderColor: '#343440', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyLogo: { fontSize: 30, color: '#FFF' },
  heroBrand: { color: '#FFF', fontSize: 34, fontWeight: '900', letterSpacing: -1, marginBottom: 6 },
  emptyChatText: { color: '#CCC', fontSize: 16, fontWeight: '500', marginBottom: 14, textAlign: 'center' },
  trustStrip: { alignItems: 'center', backgroundColor: '#0E0E12', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: '#22222A', marginBottom: 18 },
  trustText: { color: '#9CC2F7', fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center', marginBottom: 3 },
  trustSub: { color: '#777784', fontSize: 11, fontWeight: '500', textAlign: 'center' },
  heroPrimaryCta: { backgroundColor: '#FFF', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 24, marginBottom: 20 },
  heroPrimaryCtaText: { color: '#000', fontSize: 14, fontWeight: '800' },
  starterGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, width: '100%', maxWidth: 560 },
  starterCard: { backgroundColor: '#16161C', padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#30303C', width: '47%', minWidth: 150 },
  starterIcon: { color: '#4A90E2', fontSize: 15, fontWeight: '800', marginBottom: 6 },
  starterTitle: { color: '#FFF', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  starterSub: { color: '#888', fontSize: 11 },
  thinkingCard: { alignSelf: 'flex-start', backgroundColor: '#121215', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: '#222228', marginVertical: 8 },
  thinkingText: { color: '#9CC2F7', fontSize: 13, fontWeight: '600' },
  userMsgWrap: { alignSelf: 'flex-end', alignItems: 'flex-end', marginVertical: 8, maxWidth: '85%' },
  userMsg: { backgroundColor: '#1A1A1A', padding: 16, borderRadius: 24, borderBottomRightRadius: 4, borderWidth: 1, borderColor: '#222' },
  editingBubble: { borderColor: '#4A90E2', backgroundColor: '#162030' },
  editTrigger: { paddingTop: 5, paddingHorizontal: 6 },
  editTriggerText: { color: '#666', fontSize: 12, fontWeight: '600' },
  editingBanner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#131C2B', paddingHorizontal: 18, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#233554' },
  editingBannerText: { color: '#7BB1F5', fontSize: 12, fontWeight: '600' },
  editingCancelText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  aiMsg: { alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 4, marginVertical: 6, maxWidth: '96%' },
  msgText: { color: '#EAEAEA', fontSize: 16, lineHeight: 26 },
  mdHeading: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 8, marginBottom: 4, letterSpacing: -0.2 },
  mdDivider: { height: 1, backgroundColor: '#24242A', marginVertical: 12 },
  msgImageThumb: { width: 90, height: 90, borderRadius: 12, marginRight: 8, backgroundColor: '#111' },
  sourcesWrap: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#18181C' },
  sourcesLabel: { color: '#666', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  sourcePill: { backgroundColor: '#16161B', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: '#282830', maxWidth: 190 },
  sourcePillText: { color: '#7BB1F5', fontSize: 12, fontWeight: '600' },
  codeContainer: { backgroundColor: '#0D0D10', borderRadius: 14, borderWidth: 1, borderColor: '#222', marginVertical: 10, overflow: 'hidden' },
  codeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#151518', borderBottomWidth: 1, borderBottomColor: '#202025' },
  codeLang: { color: '#888', fontSize: 12, fontWeight: '700', flex: 1, marginRight: 8 },
  copyBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, backgroundColor: '#202026' },
  saveBtnText: { color: '#4A90E2', fontSize: 12, fontWeight: '700' },
  copyBtnText: { color: '#CCC', fontSize: 12, fontWeight: '600' },
  codeScroll: { padding: 14 },
  codeText: { color: '#E0E0E0', fontSize: 14, lineHeight: 22, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  mediaNoticeText: { color: '#F5A623', fontSize: 12, paddingHorizontal: 20, paddingVertical: 6 },
  previewBar: { maxHeight: 74, paddingHorizontal: 15, paddingVertical: 6, backgroundColor: '#080808', borderTopWidth: 1, borderTopColor: '#151515' },
  previewCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#161618', borderRadius: 12, padding: 6, marginRight: 10, borderWidth: 1, borderColor: '#252528' },
  previewThumb: { width: 44, height: 44, borderRadius: 8, marginRight: 8 },
  previewLabel: { color: '#CCC', fontSize: 12, fontWeight: '600', marginRight: 8 },
  removeAttBtn: { padding: 4 },
  removeAttText: { color: '#888', fontSize: 14, fontWeight: 'bold' },
  inputOuter: { borderTopWidth: 1, borderTopColor: '#1C1C24', backgroundColor: '#000' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', padding: 15, paddingBottom: 20 },
  attachBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#22222A', justifyContent: 'center', alignItems: 'center', marginRight: 6, borderWidth: 1, borderColor: '#3E3E4A' },
  webBtnActive: { backgroundColor: '#163052', borderColor: '#4A90E2' },
  attachTxt: { fontSize: 17 },
  input: { flex: 1, backgroundColor: '#1D1D24', color: '#FFF', paddingHorizontal: 18, paddingVertical: 13, borderRadius: 30, fontSize: 16, borderWidth: 1, borderColor: '#3E3E4C' },
  sendBtn: { marginLeft: 8, backgroundColor: '#FFF', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendBtnIdle: { backgroundColor: '#2A2A34', borderWidth: 1, borderColor: '#444452' },
  sendTxt: { fontSize: 22, fontWeight: 'bold' }
});
