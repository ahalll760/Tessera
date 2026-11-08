import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, Text, View, TextInput, TouchableOpacity, 
  FlatList, SafeAreaView, KeyboardAvoidingView, Platform, 
  ActivityIndicator, StatusBar, Modal, Pressable, Animated, ScrollView,
  Linking
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter (Free)',
    models: [
      { id: 'openrouter/free', name: 'Auto-Router (Fast)' },
      { id: 'google/gemma-4-26b-a4b-it:free', name: 'Google Gemma 4 (Free)' }
    ]
  },
  {
    id: 'openai',
    name: 'OpenAI (Paid)',
    models: [
      { id: 'openai/gpt-4o', name: 'GPT-4o (Paid)' },
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini (Paid)' }
    ]
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Paid)',
    models: [
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (Paid)' }
    ]
  },
  {
    id: 'google',
    name: 'Google (Paid)',
    models: [
      { id: 'google/gemini-1.5-pro', name: 'Gemini 1.5 Pro (Paid)' },
      { id: 'google/gemini-1.5-flash', name: 'Gemini 1.5 Flash (Paid)' }
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek (Paid)',
    models: [
      { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3 (Paid)' }
    ]
  },
  {
    id: 'meta',
    name: 'Meta (Paid)',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (Paid)' }
    ]
  },
  {
    id: 'alibaba',
    name: 'Alibaba (Paid)',
    models: [
      { id: 'qwen/qwen-2.5-coder-32b-instruct', name: 'Qwen 2.5 Coder (Paid)' }
    ]
  }
];

const ThinkingIndicator = () => {
  const fadeAnim = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0.3, duration: 600, useNativeDriver: true })
      ])
    ).start();
  }, []);
  return (
    <View style={styles.aiMsg}>
      <Animated.Text style={[styles.msgText, { opacity: fadeAnim, color: '#888', fontStyle: 'italic' }]}>
        ✧ Synthesizing...
      </Animated.Text>
    </View>
  );
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('chat');
  const [showModels, setShowModels] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null); 
  const [isModalVisible, setIsModalVisible] = useState(false); 
  
  const [apiKey, setApiKey] = useState('');
  const [backupKey, setBackupKey] = useState(''); // Groq Backup Key
  const [userContext, setUserContext] = useState('');
  const [savedChats, setSavedChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(PROVIDERS[0].models[0]); 

  const slideAnim = useRef(new Animated.Value(-350)).current; 

  useEffect(() => {
    (async () => {
      try {
        const storedKey = await AsyncStorage.getItem('@council_api_key_v1');
        if (storedKey) setApiKey(storedKey);

        const storedBackup = await AsyncStorage.getItem('@council_backup_key_v1');
        if (storedBackup) setBackupKey(storedBackup);

        const storedChats = await AsyncStorage.getItem('@council_chats_v1');
        if (storedChats) setSavedChats(JSON.parse(storedChats));
        
        const storedContext = await AsyncStorage.getItem('@council_context_v1');
        if (storedContext) setUserContext(storedContext);
      } catch (err) { console.log('Storage error:', err); }
    })();
  }, []);

  const handleApiKeyChange = async (key) => {
    setApiKey(key);
    try { await AsyncStorage.setItem('@council_api_key_v1', key.trim()); } catch (e) {}
  };

  const handleBackupKeyChange = async (key) => {
    setBackupKey(key);
    try { await AsyncStorage.setItem('@council_backup_key_v1', key.trim()); } catch (e) {}
  };

  const handleContextChange = async (text) => {
    setUserContext(text);
    try { await AsyncStorage.setItem('@council_context_v1', text); } catch (e) {}
  };

  const syncChatsWithStorage = async (updatedList) => {
    setSavedChats(updatedList);
    try { await AsyncStorage.setItem('@council_chats_v1', JSON.stringify(updatedList)); } catch (e) {}
  };

  const openMenu = () => {
    setIsModalVisible(true);
    Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
  };

  const closeMenu = () => {
    Animated.timing(slideAnim, { toValue: -350, duration: 250, useNativeDriver: true }).start(() => setIsModalVisible(false));
  };

  const startNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setInputText('');
    closeMenu();
  };

  const selectChat = (chat) => {
    setActiveChatId(chat.id);
    setMessages(chat.messages);
    closeMenu();
  };

  const deleteChat = async (id, e) => {
    e.stopPropagation();
    const updated = savedChats.filter(c => c.id !== id);
    if (activeChatId === id) { setActiveChatId(null); setMessages([]); }
    await syncChatsWithStorage(updated);
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;
    
    const currentId = activeChatId || Date.now().toString();
    if (!activeChatId) setActiveChatId(currentId);
    
    const newUserMsg = { role: 'user', content: inputText };
    const chatHistory = [...messages, newUserMsg];
    setMessages(chatHistory);
    setInputText('');
    setIsLoading(true);

    if (!apiKey.trim() && !backupKey.trim()) {
      setTimeout(() => {
        setMessages([...chatHistory, { 
          role: 'assistant', 
          content: '⚠️ Please add an OpenRouter API key or a Groq Backup key in Settings to begin.' 
        }]);
        setIsLoading(false);
      }, 300);
      return;
    }

    let systemPrompt = `You are a knowledgeable, articulate, and conversational AI assistant. Provide detailed, engaging, and well-explained answers. Reply in plain text only without markdown asterisks (**).`;
    if (userContext.trim() !== '') systemPrompt += ` Context: ${userContext}`;

    // --- ATTEMPT 1: MAIN OPENROUTER API ---
    let aiReply = null;
    try {
      if (!apiKey.trim()) throw new Error("No primary key");
      
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey.trim()}`, "Content-Type": "application/json", "HTTP-Referer": "https://expo.dev", "X-Title": "Minimal AI" },
        body: JSON.stringify({ model: selectedModel.id, messages: [{ role: "system", content: systemPrompt }, ...chatHistory] })
      });
      
      if (!response.ok) throw new Error("OpenRouter failed");
      const data = await response.json();
      aiReply = data.choices[0].message.content;
    } catch (primaryErr) {
      // --- ATTEMPT 2: AUTOMATIC FAILOVER TO GROQ BACKUP ---
      try {
        if (!backupKey.trim()) throw new Error("No backup key available");
        
        // Groq uses an OpenAI-compatible endpoint structure
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${backupKey.trim()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ 
            model: "llama-3.3-70b-versatile", // Reliable fast backup model on Groq
            messages: [{ role: "system", content: systemPrompt }, ...chatHistory] 
          })
        });

        if (!response.ok) throw new Error("Groq backup failed");
        const data = await response.json();
        aiReply = `[Switched to Groq Backup] \n\n` + data.choices[0].message.content;
      } catch (backupErr) {
        setMessages([...chatHistory, { role: 'assistant', content: '❌ Error: Both primary (OpenRouter) and backup (Groq) keys failed or are missing credits.' }]);
        setIsLoading(false);
        return;
      }
    }

    if (aiReply) {
      const finalHistory = [...chatHistory, { role: 'assistant', content: aiReply }];
      setMessages(finalHistory);
      saveSessionToHistory(currentId, finalHistory);
    }
    setIsLoading(false);
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

  // --- SETTINGS SCREEN WITH BACKUP CONFIG ---
  if (currentScreen === 'settings') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setCurrentScreen('chat')}><Text style={styles.headerIcon}>←</Text></TouchableOpacity>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{width: 30}} />
        </View>

        <ScrollView style={styles.settingsContent}>
          {/* PRIMARY KEY */}
          <Text style={styles.sectionLabel}>PRIMARY: OPENROUTER API KEY</Text>
          <TextInput 
            style={styles.keyInput} 
            value={apiKey} 
            onChangeText={handleApiKeyChange} 
            placeholder="sk-or-v1-..." 
            placeholderTextColor="#444" 
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL('https://openrouter.ai/keys')}>
            <Text style={styles.linkButtonText}>Get OpenRouter Key ↗</Text>
          </TouchableOpacity>

          <View style={{height: 15}} />

          {/* BACKUP KEY */}
          <Text style={styles.sectionLabel}>BACKUP: GROQ API KEY (FAILOVER)</Text>
          <Text style={styles.helperText}>If OpenRouter hits a limit or goes down, your requests automatically route through Groq.</Text>
          <TextInput 
            style={styles.keyInput} 
            value={backupKey} 
            onChangeText={handleBackupKeyChange} 
            placeholder="gsk_..." 
            placeholderTextColor="#444" 
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL('https://console.groq.com/keys')}>
            <Text style={styles.linkButtonText}>Get Free Groq Backup Key ↗</Text>
          </TouchableOpacity>

          <View style={styles.tutorialBox}>
            <Text style={styles.tutorialTitle}>How Failover Works:</Text>
            <Text style={styles.tutorialStep}>• Groq provides ultra-fast open-source model inference.</Text>
            <Text style={styles.tutorialStep}>• If your primary key fails, the app instantly switches rails to keep your chat alive.</Text>
          </View>

          <View style={styles.settingsSpacer} />

          <Text style={styles.sectionLabel}>CUSTOM INSTRUCTIONS</Text>
          <TextInput 
            style={styles.contextInput} 
            value={userContext} 
            onChangeText={handleContextChange} 
            multiline 
            placeholder="e.g., Explain things simply..." 
            placeholderTextColor="#444" 
          />
          <View style={{height: 60}} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={openMenu}><Text style={styles.headerIcon}>☰</Text></TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => {
            setSelectedCompany(null);
            setShowModels(!showModels);
          }} 
          style={styles.modelBtn}
        >
          <Text style={styles.modelBtnText} numberOfLines={1}>{selectedModel.name} ▾</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={startNewChat}><Text style={styles.headerIcon}>＋</Text></TouchableOpacity>
      </View>

      {showModels && (
        <View style={styles.modelDropdown}>
          {!selectedCompany ? (
            <View>
              <View style={styles.dropdownHeader}>
                <Text style={styles.dropdownHeaderTitle}>Select Provider</Text>
                <TouchableOpacity onPress={() => setShowModels(false)}>
                  <Text style={styles.dropdownCloseBtn}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {PROVIDERS.map((provider) => (
                  <TouchableOpacity 
                    key={provider.id} 
                    style={styles.providerRow}
                    onPress={() => setSelectedCompany(provider)}
                  >
                    <Text style={styles.providerRowText}>{provider.name}</Text>
                    <Text style={styles.providerChevron}>›</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View>
              <View style={styles.dropdownHeader}>
                <TouchableOpacity onPress={() => setSelectedCompany(null)} style={styles.backRow}>
                  <Text style={styles.backArrow}>‹</Text>
                  <Text style={styles.dropdownHeaderTitle}>{selectedCompany.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setSelectedCompany(null); setShowModels(false); }}>
                  <Text style={styles.dropdownCloseBtn}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                {selectedCompany.models.map((m) => {
                  const isSelected = selectedModel.id === m.id;
                  return (
                    <TouchableOpacity 
                      key={m.id} 
                      style={[styles.modelRow, isSelected && styles.selectedModelRow]}
                      onPress={() => {
                        setSelectedModel(m);
                        setSelectedCompany(null);
                        setShowModels(false);
                      }}
                    >
                      <Text style={[styles.modelRowText, isSelected && styles.selectedModelRowText]}>
                        {m.name}
                      </Text>
                      {isSelected && <Text style={styles.checkmark}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      )}

      <Modal visible={isModalVisible} transparent={true} animationType="fade">
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

            <View style={styles.menuFooter}>
              <TouchableOpacity style={styles.settingsRow} onPress={() => { closeMenu(); setCurrentScreen('settings'); }}>
                <Text style={styles.settingsRowText}>⚙ Settings</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
          <Pressable style={styles.menuCloseArea} onPress={closeMenu} />
        </View>
      </Modal>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={{ flex: 1 }}>
        <FlatList
          key="chat-list"
          data={isLoading ? [...messages, { role: 'thinking' }] : messages}
          keyExtractor={(_, i) => i.toString()}
          renderItem={({ item }) => item.role === 'thinking' ? <ThinkingIndicator /> : <View style={item.role === 'user' ? styles.userMsg : styles.aiMsg}><Text style={styles.msgText}>{item.content.replace(/\*\*/g, '')}</Text></View>}
          contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'flex-end' }}
          ListEmptyComponent={() => <View style={styles.emptyChat}><Text style={styles.emptyLogo}>✧</Text><Text style={styles.emptyChatText}>How can I help?</Text></View>}
        />
        <View style={styles.inputContainer}>
          <TextInput style={styles.input} value={inputText} onChangeText={setInputText} placeholder="Message..." placeholderTextColor="#666" />
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={isLoading}><Text style={[styles.sendTxt, { opacity: isLoading ? 0.3 : 1 }]}>↑</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#111' },
  headerIcon: { color: '#FFF', fontSize: 24, padding: 5 },
  modelBtn: { backgroundColor: '#111', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, maxWidth: 210 },
  modelBtnText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  modelDropdown: { backgroundColor: '#161618', position: 'absolute', top: 70, alignSelf: 'center', zIndex: 20, borderRadius: 18, width: 270, borderWidth: 1, borderColor: '#2A2A2E', overflow: 'hidden' },
  dropdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#1C1C1F' },
  dropdownHeaderTitle: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  dropdownCloseBtn: { color: '#888', fontSize: 14, padding: 4 },
  backRow: { flexDirection: 'row', alignItems: 'center' },
  backArrow: { color: '#4A90E2', fontSize: 20, fontWeight: '800', marginRight: 6 },
  providerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#202022' },
  providerRowText: { color: '#DDD', fontSize: 14, fontWeight: '600' },
  providerChevron: { color: '#555', fontSize: 18 },
  modelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#202022' },
  selectedModelRow: { backgroundColor: '#202026' },
  modelRowText: { color: '#CCC', fontSize: 14 },
  selectedModelRowText: { color: '#FFF', fontWeight: '700' },
  checkmark: { color: '#4A90E2', fontSize: 14, fontWeight: 'bold' },
  menuOverlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)' },
  menuContent: { width: '80%', backgroundColor: '#0A0A0A', padding: 20, paddingTop: 50, borderRightWidth: 1, borderRightColor: '#222' },
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
  deleteBtnText: { color: '#555', fontSize: 12 },
  menuFooter: { borderTopWidth: 1, borderTopColor: '#222', paddingTop: 15 },
  settingsRowText: { color: '#FFF', fontSize: 16 },
  settingsContent: { padding: 20 },
  sectionLabel: { color: '#888', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 },
  helperText: { color: '#555', fontSize: 13, marginBottom: 12, lineHeight: 18 },
  keyInput: { backgroundColor: '#111', color: '#FFF', fontSize: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#222', marginBottom: 12 },
  linkButton: { backgroundColor: '#1C1C1E', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#333', marginBottom: 16 },
  linkButtonText: { color: '#4A90E2', fontSize: 14, fontWeight: '700' },
  tutorialBox: { backgroundColor: '#0D0D0D', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#222' },
  tutorialTitle: { color: '#BBB', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  tutorialStep: { color: '#777', fontSize: 13, lineHeight: 20, marginBottom: 4 },
  contextInput: { backgroundColor: '#111', color: '#FFF', fontSize: 15, minHeight: 120, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#222', textAlignVertical: 'top' },
  settingsSpacer: { height: 25 },
  emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyLogo: { fontSize: 40, color: '#333' },
  emptyChatText: { color: '#555', fontSize: 18 },
  userMsg: { alignSelf: 'flex-end', backgroundColor: '#1A1A1A', padding: 16, borderRadius: 24, borderBottomRightRadius: 4, marginVertical: 8, maxWidth: '85%' },
  aiMsg: { alignSelf: 'flex-start', padding: 16, marginVertical: 8, maxWidth: '90%' },
  msgText: { color: '#FFF', fontSize: 16, lineHeight: 26 },
  inputContainer: { flexDirection: 'row', padding: 15, paddingBottom: 20, backgroundColor: '#000', borderTopWidth: 1, borderTopColor: '#111' },
  input: { flex: 1, backgroundColor: '#1A1A1A', color: '#FFF', paddingHorizontal: 20, paddingVertical: 15, borderRadius: 30, fontSize: 16, borderWidth: 1, borderColor: '#222' },
  sendBtn: { marginLeft: 10, backgroundColor: '#FFF', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  sendTxt: { color: '#000', fontSize: 24, fontWeight: 'bold' }
});
