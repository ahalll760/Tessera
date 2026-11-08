import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter (Free)', models: [
    { id: 'openrouter/free', name: 'Auto-Router (Fast)' },
    { id: 'google/gemma-4-26b-a4b-it:free', name: 'Google Gemma 4' },
  ] },
  { id: 'openai', name: 'OpenAI', models: [
    { id: 'openai/o3-mini', name: 'OpenAI: o3-mini' },
    { id: 'openai/gpt-4o', name: 'OpenAI: GPT-4o' },
    { id: 'openai/gpt-4o-mini', name: 'OpenAI: GPT-4o Mini' },
  ] },
  { id: 'anthropic', name: 'Anthropic (Direct)', models: [
    { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
  ] },
  { id: 'google', name: 'Google', models: [
    { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'google/gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
  ] },
  { id: 'deepseek', name: 'DeepSeek', models: [
    { id: 'deepseek/deepseek-r1', name: 'DeepSeek: R1' },
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek: V3' },
  ] },
  { id: 'meta', name: 'Meta', models: [{ id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 (70B)' }] },
  { id: 'alibaba', name: 'Alibaba (Qwen)', models: [{ id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder' }] },
];

const KEYS = {
  openrouter: '@council_api_key_v1',
  anthropic: '@council_anthropic_key_v1',
  chats: '@council_chats_v1',
  context: '@council_context_v1',
  hideNotice: '@council_hide_api_notice',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJsonResponse(response) {
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (![408, 429, 500, 502, 503, 504].includes(response.status) || attempt === attempts - 1) {
        return response;
      }
      await response.text().catch(() => {});
      await sleep(500 * (attempt + 1));
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError || new Error('Request failed');
}

function extractOpenRouterText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const text = content.map((part) => part?.text || '').join('');
    if (text.trim()) return text;
  }
  throw new Error('The provider returned no assistant message.');
}

function extractAnthropicText(data) {
  const text = Array.isArray(data?.content) ? data.content.map((part) => part?.text || '').join('') : '';
  if (text.trim()) return text;
  throw new Error('Anthropic returned no assistant message.');
}

function ThinkingIndicator() {
  const opacity = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.35, duration: 600, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  return <Animated.Text style={[styles.messageText, styles.thinking, { opacity }]}>✧ Synthesizing...</Animated.Text>;
}

function MessageText({ content }) {
  return <Text style={styles.messageText}>{String(content || '')}</Text>;
}

export default function App() {
  const [screen, setScreen] = useState('chat');
  const [apiKey, setApiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [userContext, setUserContext] = useState('');
  const [savedChats, setSavedChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(PROVIDERS[0].models[0]);
  const [providerOpen, setProviderOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const menuAnimation = useRef(new Animated.Value(-360)).current;
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [key, claude, chats, context, hide] = await Promise.all([
          AsyncStorage.getItem(KEYS.openrouter), AsyncStorage.getItem(KEYS.anthropic),
          AsyncStorage.getItem(KEYS.chats), AsyncStorage.getItem(KEYS.context), AsyncStorage.getItem(KEYS.hideNotice),
        ]);
        if (cancelled) return;
        if (key) setApiKey(key);
        if (claude) setAnthropicKey(claude);
        if (context) setUserContext(context);
        if (chats) {
          try { setSavedChats(JSON.parse(chats)); } catch { setSavedChats([]); }
        }
        const hidden = hide === 'true';
        setDontShowAgain(hidden);
        if (!hidden && !key && !claude) setNoticeOpen(true);
      } catch (error) { console.warn('Unable to load local settings', error); }
    })();
    return () => { cancelled = true; };
  }, []);

  const persist = useCallback(async (key, value) => {
    try { await AsyncStorage.setItem(key, value); } catch (error) { console.warn('Unable to save local data', error); }
  }, []);

  const updateChats = useCallback((updater) => {
    setSavedChats((previous) => {
      const next = typeof updater === 'function' ? updater(previous) : updater;
      persist(KEYS.chats, JSON.stringify(next));
      return next;
    });
  }, [persist]);

  const openMenu = () => {
    setMenuOpen(true);
    Animated.timing(menuAnimation, { toValue: 0, duration: 250, useNativeDriver: true }).start();
  };
  const closeMenu = () => Animated.timing(menuAnimation, { toValue: -360, duration: 200, useNativeDriver: true }).start(() => setMenuOpen(false));

  const newChat = () => { setActiveChatId(null); setMessages([]); setInputText(''); closeMenu(); };
  const selectChat = (chat) => { setActiveChatId(chat.id); setMessages(Array.isArray(chat.messages) ? chat.messages : []); closeMenu(); };
  const deleteChat = (id) => {
    updateChats((chats) => chats.filter((chat) => chat.id !== id));
    if (activeChatId === id) { setActiveChatId(null); setMessages([]); }
  };

  const saveChat = useCallback((chatId, chatMessages) => {
    const firstUser = chatMessages.find((message) => message.role === 'user');
    const title = (firstUser?.content || 'Conversation').slice(0, 28);
    updateChats((chats) => {
      const index = chats.findIndex((chat) => chat.id === chatId);
      if (index < 0) return [{ id: chatId, title, messages: chatMessages }, ...chats];
      return chats.map((chat, i) => i === index ? { ...chat, messages: chatMessages } : chat);
    });
  }, [updateChats]);

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    const chatId = activeChatId || String(Date.now());
    const history = [...messages, { role: 'user', content: text }];
    setActiveChatId(chatId); setMessages(history); setInputText(''); setIsLoading(true);
    const isClaude = selectedModel.id.includes('claude');
    if ((!isClaude && !apiKey.trim()) || (isClaude && !apiKey.trim() && !anthropicKey.trim())) {
      const warning = isClaude ? 'Please add an Anthropic or OpenRouter API key in Settings.' : 'Please add your OpenRouter API key in Settings.';
      setMessages([...history, { role: 'assistant', content: `⚠️ ${warning}` }]); setIsLoading(false); return;
    }
    const system = `You are Tessarc, a helpful and concise AI assistant powered by ${selectedModel.name}. Use natural emojis when appropriate. Format code with fenced code blocks. ${userContext.trim() ? `User context: ${userContext}` : ''}`;
    try {
      let reply;
      if (isClaude && anthropicKey.trim()) {
        const response = await fetchWithRetry('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'x-api-key': anthropicKey.trim(), 'anthropic-version': '2023-06-05', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: selectedModel.id.includes('3.7') ? 'claude-3-7-sonnet-20250219' : 'claude-3-5-sonnet-20241022', max_tokens: 4000, system, messages: history.map(({ role, content }) => ({ role, content })) }),
        });
        reply = extractAnthropicText(await readJsonResponse(response));
      } else {
        const response = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey.trim() || anthropicKey.trim()}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://expo.dev', 'X-Title': 'Tessarc' },
          body: JSON.stringify({ model: selectedModel.id, messages: [{ role: 'system', content: system }, ...history] }),
        });
        reply = extractOpenRouterText(await readJsonResponse(response));
      }
      const finalMessages = [...history, { role: 'assistant', content: reply }];
      if (!mounted.current) return;
      setMessages(finalMessages); saveChat(chatId, finalMessages);
    } catch (error) {
      if (!mounted.current) return;
      setMessages([...history, { role: 'assistant', content: `⚠️ ${error?.message || 'The request failed. Please try again.'}` }]);
    } finally { if (mounted.current) setIsLoading(false); }
  };

  const toggleNotice = async () => {
    const next = !dontShowAgain; setDontShowAgain(next); await persist(KEYS.hideNotice, String(next));
  };

  if (screen === 'settings') return (
    <SafeAreaView style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.header}><TouchableOpacity onPress={() => setScreen('chat')}><Text style={styles.icon}>←</Text></TouchableOpacity><Text style={styles.headerTitle}>Settings</Text><View style={{ width: 30 }} /></View>
      <ScrollView contentContainerStyle={styles.settings}>
        <Text style={styles.label}>OPENROUTER API KEY</Text><Text style={styles.help}>Used for OpenRouter models and as Claude fallback.</Text>
        <TextInput style={styles.input} value={apiKey} onChangeText={(value) => { setApiKey(value); persist(KEYS.openrouter, value.trim()); }} placeholder="sk-or-v1-..." placeholderTextColor="#555" autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <TouchableOpacity style={styles.link} onPress={() => Linking.openURL('https://openrouter.ai/keys')}><Text style={styles.linkText}>Get OpenRouter Key ↗</Text></TouchableOpacity>
        <Text style={styles.label}>ANTHROPIC API KEY</Text><Text style={styles.help}>Used for direct Claude requests.</Text>
        <TextInput style={styles.input} value={anthropicKey} onChangeText={(value) => { setAnthropicKey(value); persist(KEYS.anthropic, value.trim()); }} placeholder="sk-ant-..." placeholderTextColor="#555" autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <TouchableOpacity style={styles.link} onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}><Text style={styles.linkText}>Get Anthropic Key ↗</Text></TouchableOpacity>
        <Text style={styles.label}>CUSTOM INSTRUCTIONS</Text><TextInput style={[styles.input, styles.context]} value={userContext} onChangeText={(value) => { setUserContext(value); persist(KEYS.context, value); }} multiline placeholder="Explain things simply..." placeholderTextColor="#555" />
      </ScrollView>
    </SafeAreaView>
  );

  const data = isLoading ? [...messages, { role: 'thinking', id: 'thinking' }] : messages;
  return <SafeAreaView style={styles.container}><StatusBar barStyle="light-content" backgroundColor="#000" />
    <View style={styles.header}><TouchableOpacity onPress={openMenu}><Text style={styles.icon}>☰</Text></TouchableOpacity><TouchableOpacity style={styles.modelButton} onPress={() => { setProviderOpen(true); setSelectedProvider(null); }}><Text style={styles.modelText} numberOfLines={1}>{selectedModel.name} ▾</Text></TouchableOpacity><TouchableOpacity onPress={newChat}><Text style={styles.icon}>＋</Text></TouchableOpacity></View>
    <Modal visible={noticeOpen && !dontShowAgain} transparent animationType="fade"><View style={styles.backdrop}><View style={styles.card}><Text style={styles.cardTitle}>🔑 Setup Required</Text><Text style={styles.help}>Add an API key in Settings to start chatting.</Text><TouchableOpacity style={styles.primary} onPress={() => { setNoticeOpen(false); setScreen('settings'); }}><Text style={styles.primaryText}>Go to Settings</Text></TouchableOpacity><TouchableOpacity onPress={toggleNotice} style={styles.checkbox}><Text style={styles.help}>{dontShowAgain ? '☑' : '☐'}  Don't show this again</Text></TouchableOpacity><TouchableOpacity onPress={() => setNoticeOpen(false)}><Text style={styles.dismiss}>Dismiss</Text></TouchableOpacity></View></View></Modal>
    <Modal visible={providerOpen} transparent animationType="fade"><Pressable style={styles.backdrop} onPress={() => setProviderOpen(false)}><Pressable style={styles.selector} onPress={(event) => event.stopPropagation()}>{!selectedProvider ? <><Text style={styles.cardTitle}>Select Provider</Text><ScrollView>{PROVIDERS.map((provider) => <TouchableOpacity key={provider.id} style={styles.row} onPress={() => setSelectedProvider(provider)}><Text style={styles.rowText}>{provider.name}</Text><Text style={styles.help}>›</Text></TouchableOpacity>)}</ScrollView></> : <><TouchableOpacity onPress={() => setSelectedProvider(null)}><Text style={styles.linkText}>‹ {selectedProvider.name}</Text></TouchableOpacity>{selectedProvider.models.map((model) => <TouchableOpacity key={model.id} style={styles.row} onPress={() => { setSelectedModel(model); setProviderOpen(false); setSelectedProvider(null); }}><Text style={styles.rowText}>{model.name}</Text>{selectedModel.id === model.id && <Text style={styles.linkText}>✓</Text>}</TouchableOpacity>)}</>}</Pressable></Pressable></Modal>
    <Modal visible={menuOpen} transparent animationType="none"><View style={styles.menuOverlay}><Animated.View style={[styles.menu, { transform: [{ translateX: menuAnimation }] }]}><TouchableOpacity style={styles.primary} onPress={newChat}><Text style={styles.primaryText}>＋ New Chat</Text></TouchableOpacity><Text style={styles.label}>RECENTS</Text><ScrollView>{savedChats.length === 0 ? <Text style={styles.help}>No chats yet.</Text> : savedChats.map((chat) => <View key={chat.id} style={styles.history}><TouchableOpacity style={{ flex: 1 }} onPress={() => selectChat(chat)}><Text style={styles.rowText} numberOfLines={1}>{chat.title}</Text></TouchableOpacity><TouchableOpacity onPress={() => deleteChat(chat.id)}><Text style={styles.help}>✕</Text></TouchableOpacity></View>)}</ScrollView><TouchableOpacity onPress={() => { closeMenu(); setScreen('settings'); }}><Text style={styles.rowText}>⚙ Settings</Text></TouchableOpacity></Animated.View><Pressable style={styles.menuClose} onPress={closeMenu} /></View></Modal>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding"><FlatList data={data} keyExtractor={(item, index) => item.id || String(index)} contentContainerStyle={styles.list} renderItem={({ item }) => item.role === 'thinking' ? <ThinkingIndicator /> : <View style={item.role === 'user' ? styles.userBubble : styles.aiBubble}><MessageText content={item.content} /></View>} ListEmptyComponent={<View style={styles.empty}><Text style={styles.logo}>✧</Text><Text style={styles.help}>How can I help?</Text></View>} /><View style={styles.composer}><TextInput style={styles.messageInput} value={inputText} onChangeText={setInputText} placeholder="Message..." placeholderTextColor="#666" onSubmitEditing={sendMessage} returnKeyType="send" /><TouchableOpacity style={styles.send} onPress={sendMessage} disabled={isLoading}><Text style={styles.sendText}>{isLoading ? <ActivityIndicator color="#000" /> : '↑'}</Text></TouchableOpacity></View></KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#151515' },
  icon: { color: '#fff', fontSize: 24, padding: 4 }, headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modelButton: { maxWidth: 230, backgroundColor: '#151515', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 }, modelText: { color: '#fff', fontWeight: '600' },
  list: { padding: 20, flexGrow: 1, justifyContent: 'flex-end' }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center' }, logo: { color: '#444', fontSize: 42 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#1a1a1a', borderRadius: 22, borderBottomRightRadius: 4, padding: 15, marginVertical: 7, maxWidth: '85%' }, aiBubble: { alignSelf: 'flex-start', padding: 15, marginVertical: 7, maxWidth: '95%' }, messageText: { color: '#fff', fontSize: 16, lineHeight: 25 }, thinking: { color: '#888', fontStyle: 'italic' },
  composer: { flexDirection: 'row', gap: 10, padding: 15, paddingBottom: 20, borderTopWidth: 1, borderTopColor: '#151515' }, messageInput: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 28, paddingHorizontal: 20, color: '#fff', fontSize: 16 }, send: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, sendText: { color: '#000', fontSize: 24, fontWeight: '700' },
  settings: { padding: 20, gap: 10 }, label: { color: '#888', fontSize: 12, fontWeight: '800', letterSpacing: 1.2, marginTop: 14 }, help: { color: '#777', fontSize: 13, lineHeight: 19 }, input: { backgroundColor: '#111', borderColor: '#252525', borderWidth: 1, borderRadius: 14, padding: 15, color: '#fff', fontSize: 15 }, context: { minHeight: 120, textAlignVertical: 'top' }, link: { padding: 13, alignItems: 'center', backgroundColor: '#18181a', borderRadius: 12 }, linkText: { color: '#4a90e2', fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.75)', justifyContent: 'center', alignItems: 'center', padding: 22 }, card: { width: '100%', backgroundColor: '#151517', borderRadius: 20, padding: 22 }, cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 14 }, primary: { backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', marginVertical: 12 }, primaryText: { color: '#000', fontWeight: '800' }, checkbox: { paddingVertical: 8 }, dismiss: { color: '#777', textAlign: 'center', padding: 8 },
  selector: { width: '86%', maxHeight: '70%', backgroundColor: '#171719', borderRadius: 18, padding: 18 }, row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#292929' }, rowText: { color: '#ddd', fontSize: 15 },
  menuOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,.65)' }, menu: { width: '82%', backgroundColor: '#0b0b0b', padding: 20, paddingTop: 55 }, menuClose: { flex: 1 }, history: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
});
