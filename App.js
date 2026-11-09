import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  FlatList, SafeAreaView, KeyboardAvoidingView, Platform, 
  StatusBar, Animated, ScrollView, Linking, Modal
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROVIDERS = [
  { id: 'free', name: '🌟 Free Models', models: [ { id: 'openrouter/free', name: 'Auto-Router (Fast)' }, { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B' }, { id: 'qwen/qwen-2.5-coder-32b-instruct:free', name: 'Qwen 2.5 Coder' } ] },
  { id: 'openai', name: 'OpenAI (Paid)', models: [ { id: 'openai/gpt-4o', name: 'GPT-4o' }, { id: 'openai/o3-mini', name: 'o3-mini (Reasoning)' } ] },
  { id: 'anthropic', name: 'Anthropic (Paid)', models: [ { id: 'anthropic/claude-3.7-sonnet', name: 'Claude 3.7 Sonnet' } ] }
];

const ACTIONS = [
  { icon: '📝', label: 'Draft Email', prompt: 'Draft a professional but concise email regarding my current focus.' },
  { icon: '🐛', label: 'Fix Code', prompt: 'Review my current focus for bugs, errors, or optimizations. Provide the fixed code.' },
  { icon: '🧠', label: 'Brainstorm', prompt: 'Give me 3 creative ideas or next steps regarding my current focus.' },
  { icon: '📖', label: 'Summarize', prompt: 'Summarize the key points of my current focus in bullet points.' }
];

const ThinkingIndicator = () => {
  const fadeAnim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }), Animated.timing(fadeAnim, { toValue: 0.3, duration: 600, useNativeDriver: true })])).start();
  }, []);
  return <View style={styles.aiMsg}><Animated.Text style={[styles.msgText, { opacity: fadeAnim, color: '#888', fontStyle: 'italic' }]}>✧ Synthesizing...</Animated.Text></View>;
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('home'); // home, chat, settings
  const [showModels, setShowModels] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null); 
  
  // ALL KEYS STRICTLY MANAGED VIA STATE & SETTINGS NOW
  const [apiKey, setApiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  
  const [activeFocus, setActiveFocus] = useState('');
  const [userContext, setUserContext] = useState('');
  const [savedChats, setSavedChats] = useState([]);
  
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(PROVIDERS[0].models[0]); 

  // --- HYDRATION ---
  useEffect(() => {
    (async () => {
      try {
        const k = await AsyncStorage.getItem('@key'); if (k) setApiKey(k);
        const ak = await AsyncStorage.getItem('@ant_key'); if (ak) setAnthropicKey(ak);
        const f = await AsyncStorage.getItem('@focus'); if (f) setActiveFocus(f);
        const u = await AsyncStorage.getItem('@context'); if (u) setUserContext(u);
        const c = await AsyncStorage.getItem('@chats'); if (c) setSavedChats(JSON.parse(c));
      } catch (err) {}
    })();
  }, []);

  const saveFocus = (text) => { setActiveFocus(text); AsyncStorage.setItem('@focus', text); };
  const saveKey = (text) => { setApiKey(text); AsyncStorage.setItem('@key', text.trim()); };
  const saveAntKey = (text) => { setAnthropicKey(text); AsyncStorage.setItem('@ant_key', text.trim()); };
  const saveContext = (text) => { setUserContext(text); AsyncStorage.setItem('@context', text); };
  const syncChats = (list) => { setSavedChats(list); AsyncStorage.setItem('@chats', JSON.stringify(list)); };

  // --- NAVIGATION ---
  const openChat = (chatId = null, loadedMessages = []) => {
    setActiveChatId(chatId);
    setMessages(loadedMessages);
    setInputText('');
    setCurrentScreen('chat');
  };

  const triggerQuickAction = (actionPrompt) => {
    let combinedPrompt = actionPrompt;
    if (activeFocus.trim()) combinedPrompt += `\n\nHere is my current focus/data:\n${activeFocus}`;
    openChat(null, []);
    setInputText(combinedPrompt);
  };

  // --- CHAT LOGIC ---
  const sendMessage = async () => {
    if (!inputText.trim()) return;
    const currentId = activeChatId || Date.now().toString();
    if (!activeChatId) setActiveChatId(currentId);
    
    const chatHistory = [...messages, { role: 'user', content: inputText }];
    setMessages(chatHistory); setInputText(''); setIsLoading(true);

    const isClaudeModel = selectedModel.id.includes('claude');

    if (isClaudeModel && !anthropicKey.trim() && !apiKey.trim()) {
      setTimeout(() => { setMessages([...chatHistory, { role: 'assistant', content: '⚠️ Please add an Anthropic or OpenRouter key in Settings.' }]); setIsLoading(false); }, 300);
      return;
    }
    if (!isClaudeModel && !apiKey.trim()) {
      setTimeout(() => { setMessages([...chatHistory, { role: 'assistant', content: '⚠️ Please add your OpenRouter key in Settings.' }]); setIsLoading(false); }, 300);
      return;
    }

    try {
      let sys = `You are an elite AI. Be highly articulate and concise. No Markdown asterisks (**).`;
      if (userContext) sys += ` Context: ${userContext}`;

      let res, data, replyText;

      if (isClaudeModel && anthropicKey.trim()) {
        res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "x-api-key": anthropicKey.trim(), "anthropic-version": "2023-06-05", "content-type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model: 'claude-3-7-sonnet-20250219', max_tokens: 4000, system: sys, messages: chatHistory.map(m => ({ role: m.role, content: m.content })) })
        });
        data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "Anthropic Error");
        replyText = data.content[0].text;
      } else {
        const targetKey = apiKey.trim() || anthropicKey.trim();
        res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${targetKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://expo.dev", "X-Title": "Dashboard AI" },
          body: JSON.stringify({ model: selectedModel.id, messages: [{ role: "system", content: sys }, ...chatHistory] })
        });
        data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "OpenRouter Error");
        replyText = data.choices[0].message.content;
      }
      
      const finalHistory = [...chatHistory, { role: 'assistant', content: replyText }];
      setMessages(finalHistory);
      
      // Save
      let list = [...savedChats];
      const idx = list.findIndex(c => c.id === currentId);
      if (idx >= 0) list[idx].messages = finalHistory;
      else list.unshift({ id: currentId, title: chatHistory[0].content.slice(0, 30), messages: finalHistory });
      syncChats(list);

    } catch (e) {
      setMessages([...chatHistory, { role: 'assistant', content: `⚠️ Error: ${e.message}` }]);
    } finally { setIsLoading(false); }
  };

  const deleteChat = (id) => { syncChats(savedChats.filter(c => c.id !== id)); };

  // ==========================================
  // SCREEN 1: THE HOME DASHBOARD
  // ==========================================
  if (currentScreen === 'home') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0A0A0C" />
        <View style={styles.dashHeader}>
          <Text style={styles.dashTitle}>Workspace</Text>
          <TouchableOpacity onPress={() => setCurrentScreen('settings')} style={styles.iconBtn}><Text style={{fontSize: 22}}>⚙️</Text></TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{padding: 20}}>
          <View style={styles.focusCard}>
            <Text style={styles.sectionLabel}>ACTIVE FOCUS</Text>
            <TextInput style={styles.focusInput} value={activeFocus} onChangeText={saveFocus} placeholder="Dump code, ideas, or today's goal here..." placeholderTextColor="#555" multiline />
          </View>

          <Text style={[styles.sectionLabel, {marginTop: 25, marginBottom: 10}]}>QUICK ACTIONS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{overflow: 'visible'}}>
            {ACTIONS.map((action, i) => (
              <TouchableOpacity key={i} style={styles.actionChip} onPress={() => triggerQuickAction(action.prompt)}>
                <Text style={styles.actionChipIcon}>{action.icon}</Text>
                <Text style={styles.actionChipText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.sectionLabel, {marginTop: 30, marginBottom: 15}]}>RECENT SESSIONS</Text>
          {savedChats.length === 0 ? <Text style={styles.emptyText}>No recent chats.</Text> : savedChats.map(c => (
            <TouchableOpacity key={c.id} style={styles.historyCard} onPress={() => openChat(c.id, c.messages)}>
              <Text style={styles.historyTitle} numberOfLines={1}>{c.title}</Text>
              <TouchableOpacity onPress={() => deleteChat(c.id)} style={{padding: 5}}><Text style={{color: '#555'}}>✕</Text></TouchableOpacity>
            </TouchableOpacity>
          ))}
          <View style={{height: 100}} />
        </ScrollView>
        <TouchableOpacity style={styles.fab} onPress={() => openChat(null, [])}><Text style={styles.fabIcon}>＋</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ==========================================
  // SCREEN 2: SETTINGS
  // ==========================================
  if (currentScreen === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setCurrentScreen('home')}><Text style={styles.headerIcon}>←</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{width: 30}} />
        </View>
        <ScrollView style={{padding: 20}}>
          <Text style={styles.sectionLabel}>OPENROUTER API KEY</Text>
          <TextInput style={styles.keyInput} value={apiKey} onChangeText={saveKey} placeholder="sk-or-v1-..." placeholderTextColor="#444" autoCapitalize="none" />
          <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL('https://openrouter.ai/keys')}><Text style={styles.linkBtnText}>Get OpenRouter Key ↗</Text></TouchableOpacity>
          
          <Text style={[styles.sectionLabel, {marginTop: 20}]}>ANTHROPIC (CLAUDE) API KEY</Text>
          <TextInput style={styles.keyInput} value={anthropicKey} onChangeText={saveAntKey} placeholder="sk-ant-..." placeholderTextColor="#444" autoCapitalize="none" />
          <TouchableOpacity style={styles.linkBtn} onPress={() => Linking.openURL('https://console.anthropic.com/settings/keys')}><Text style={styles.linkBtnText}>Get Anthropic Key ↗</Text></TouchableOpacity>

          <Text style={[styles.sectionLabel, {marginTop: 20}]}>GLOBAL AI CONTEXT</Text>
          <TextInput style={styles.contextInput} value={userContext} onChangeText={saveContext} multiline placeholder="E.g. I am a startup founder..." placeholderTextColor="#444" />
          <View style={{height: 60}} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ==========================================
  // SCREEN 3: ACTIVE CHAT
  // ==========================================
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setCurrentScreen('home')}><Text style={styles.headerIcon}>←</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { setSelectedCompany(null); setShowModels(!showModels); }} style={styles.modelBtn}>
          <Text style={styles.modelBtnText} numberOfLines={1}>{selectedModel.name} ▾</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => openChat(null, [])}><Text style={styles.headerIcon}>＋</Text></TouchableOpacity>
      </View>

      {showModels && (
        <View style={styles.modelDropdown}>
          {!selectedCompany ? (
            <View>
              <View style={styles.dropdownHeader}><Text style={{color:'#FFF', fontWeight:'700'}}>Provider</Text><TouchableOpacity onPress={() => setShowModels(false)}><Text style={{color:'#888'}}>✕</Text></TouchableOpacity></View>
              <ScrollView style={{ maxHeight: 280 }}>
                {PROVIDERS.map((p) => (
                  <TouchableOpacity key={p.id} style={styles.providerRow} onPress={() => setSelectedCompany(p)}><Text style={{color:'#DDD'}}>{p.name}</Text><Text style={{color:'#555'}}>›</Text></TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View>
              <View style={styles.dropdownHeader}><TouchableOpacity onPress={() => setSelectedCompany(null)} style={{flexDirection:'row', alignItems:'center'}}><Text style={{color:'#4A90E2', marginRight:5, fontSize:18}}>‹</Text><Text style={{color:'#FFF', fontWeight:'700'}}>{selectedCompany.name}</Text></TouchableOpacity></View>
              <ScrollView style={{ maxHeight: 280 }}>
                {selectedCompany.models.map((m) => (
                  <TouchableOpacity key={m.id} style={[styles.modelRow, selectedModel.id === m.id && {backgroundColor:'#202026'}]} onPress={() => { setSelectedModel(m); setSelectedCompany(null); setShowModels(false); }}>
                    <Text style={{color: selectedModel.id===m.id?'#FFF':'#CCC', fontWeight: selectedModel.id===m.id?'700':'400'}}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 40} style={{ flex: 1 }}>
        <FlatList
          data={isLoading ? [...messages, { role: 'thinking' }] : messages}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => item.role === 'thinking' ? <ThinkingIndicator /> : <View style={item.role === 'user' ? styles.userMsg : styles.aiMsg}><Text style={styles.msgText}>{item.content.replace(/\*\*/g, '')}</Text></View>}
          contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'flex-end' }}
          ListEmptyComponent={() => <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text style={{fontSize:40, color:'#333'}}>✧</Text></View>}
        />
        <View style={styles.inputContainer}>
          <TextInput style={styles.input} value={inputText} onChangeText={setInputText} placeholder="Ask anything..." placeholderTextColor="#666" />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={isLoading}><Text style={{color:'#000', fontSize:20, fontWeight:'bold', opacity: isLoading?0.3:1}}>↑</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0C', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  dashHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingBottom: 10 },
  dashTitle: { color: '#FFF', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  iconBtn: { padding: 5 },
  sectionLabel: { color: '#888', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8, paddingHorizontal: 4 },
  focusCard: { backgroundColor: '#141417', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#222' },
  focusInput: { color: '#FFF', fontSize: 16, lineHeight: 24, minHeight: 100, textAlignVertical: 'top' },
  actionChip: { backgroundColor: '#1A1A1E', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, marginRight: 10, borderWidth: 1, borderColor: '#2A2A2E', flexDirection: 'row', alignItems: 'center' },
  actionChipIcon: { fontSize: 16, marginRight: 8 },
  actionChipText: { color: '#E0E0E0', fontSize: 14, fontWeight: '600' },
  recentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyCard: { backgroundColor: '#141417', padding: 16, borderRadius: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#1F1F23' },
  historyTitle: { color: '#E0E0E0', fontSize: 15, fontWeight: '500', flex: 1, marginRight: 10 },
  emptyText: { color: '#555', fontStyle: 'italic', paddingHorizontal: 4 },
  fab: { position: 'absolute', bottom: 30, right: 30, backgroundColor: '#FFF', width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.3, shadowRadius: 5 },
  fabIcon: { color: '#000', fontSize: 32, fontWeight: '300', marginTop: -2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#1A1A1A', backgroundColor: '#0A0A0C' },
  headerIcon: { color: '#FFF', fontSize: 24, padding: 5 },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  modelBtn: { backgroundColor: '#1A1A1E', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, maxWidth: 210, borderWidth: 1, borderColor: '#2A2A2E' },
  modelBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  modelDropdown: { backgroundColor: '#161618', position: 'absolute', top: 70, alignSelf: 'center', zIndex: 20, borderRadius: 18, width: 270, borderWidth: 1, borderColor: '#2A2A2E', overflow: 'hidden' },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#1C1C1F' },
  providerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#202022' },
  modelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#202022' },
  userMsg: { alignSelf: 'flex-end', backgroundColor: '#1A1A1E', padding: 16, borderRadius: 20, borderBottomRightRadius: 4, marginVertical: 8, maxWidth: '85%', borderWidth: 1, borderColor: '#2A2A2E' },
  aiMsg: { alignSelf: 'flex-start', padding: 16, marginVertical: 8, maxWidth: '95%' },
  msgText: { color: '#F2F2F2', fontSize: 16, lineHeight: 26 },
  inputContainer: { flexDirection: 'row', padding: 15, paddingBottom: 20, backgroundColor: '#0A0A0C', borderTopWidth: 1, borderTopColor: '#1A1A1A' },
  input: { flex: 1, backgroundColor: '#141417', color: '#FFF', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 24, fontSize: 16, borderWidth: 1, borderColor: '#222' },
  sendBtn: { marginLeft: 10, backgroundColor: '#FFF', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  keyInput: { backgroundColor: '#141417', color: '#FFF', fontSize: 14, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#222', marginBottom: 12 },
  linkBtn: { backgroundColor: '#1A1A1E', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#2A2A2E' },
  linkBtnText: { color: '#4A90E2', fontSize: 14, fontWeight: '700' },
  contextInput: { backgroundColor: '#141417', color: '#FFF', fontSize: 15, minHeight: 120, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#222', textAlignVertical: 'top' },
});
