import React, { useEffect, useRef, useState } from 'react';
import { Send, Bot, Loader2, MessageSquarePlus } from 'lucide-react';
import { ChatMessage, UserProfile, MelodyNote } from '../types';
import { aiErrorText, sendMessageToAI } from '../services/ai';
import ReactMarkdown from 'react-markdown';
import ChordDiagram from './ChordDiagram';
import RiffPlayer from './RiffPlayer';
import ChordProgressionPlayer from './ChordProgressionPlayer';
import { parseChordsTag } from '../utils/musicTags';
import { CHAT_STORAGE_KEY, readStorage } from '../utils/storage';

interface ChatTutorProps {
  user: UserProfile;
}

const MAX_STORED_MESSAGES = 50;
const ERROR_ID_PREFIX = 'err_';

const welcomeMessage = (name: string): ChatMessage => ({
  id: 'welcome',
  role: 'model',
  text: `Salut ${name} ! Je suis **Riffson**, ton coach interactif. 🎸\n\nJe peux t'expliquer des accords, mais je peux aussi **jouer des mélodies complètes** pour toi.\n\nDemande-moi par exemple : "Joue-moi le riff de Seven Nation Army" ou "Montre-moi un arpège triste".`,
  timestamp: Date.now()
});

const loadMessages = (name: string): ChatMessage[] => {
  try {
    const saved = JSON.parse(readStorage(CHAT_STORAGE_KEY) || '[]');
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch { /* historique corrompu : on repart de zéro */ }
  return [welcomeMessage(name)];
};

/** Historique envoyé à Gemini : uniquement les échanges question/réponse réussis. */
const toModelHistory = (messages: ChatMessage[]): ChatMessage[] => {
  const history: ChatMessage[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const q = messages[i], a = messages[i + 1];
    if (q.role === 'user' && a.role === 'model' && !a.id.startsWith(ERROR_ID_PREFIX)) {
      history.push(q, a);
      i++;
    }
  }
  return history;
};

const parseRiffTag = (tag: string): { title: string, sequence: MelodyNote[], tempo: number } | null => {
    // Format attendu : [RIFF:Titre|Tempo|s,f,d;s,f,d;...]
    const match = tag.match(/^\[RIFF:([^|\]]*)\|([^|\]]*)\|([^\]]+)\]$/);
    if (!match) return null;
    const [, title, tempoStr, notesStr] = match;
    const tempo = Number(tempoStr);
    const sequence = notesStr.split(';').filter(n => n.trim()).map(n => {
        const [s, f, d] = n.split(',').map(Number);
        return { string: s, fret: f, duration: d > 0 ? d : 1.0 };
    });
    const valid = sequence.length > 0 && sequence.every(n =>
        Number.isInteger(n.string) && n.string >= 1 && n.string <= 6 &&
        Number.isInteger(n.fret) && n.fret >= -1 && n.fret <= 24);
    if (!valid) return null;
    return { title: title.trim(), tempo: tempo > 0 && tempo <= 300 ? tempo : 100, sequence };
};

const ChatTutor: React.FC<ChatTutorProps> = ({ user }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(user.name));
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
    } catch { /* stockage plein ou indisponible */ }
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isLoading) return;
    // Historique envoyé au coach (profil à jour + échanges précédents), calculé avant d'ajouter la question
    const history = toModelHistory(messagesRef.current);
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    try {
      const responseText = await sendMessageToAI(user, history, userMsg.text);
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
    } catch (error) { 
      console.error(error); 
      const errorMsg: ChatMessage = {
        id: `${ERROR_ID_PREFIX}${Date.now()}`,
        role: 'model',
        text: `Oups, je n'arrive pas à répondre.\n\n**Cause :** ${aiErrorText(error)}\n\nLe fournisseur d'IA se configure dans l'onglet **Réglages**.`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally { 
      setIsLoading(false); 
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900">
      <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center shadow-lg z-10 sticky top-0">
        <div className="bg-amber-500 p-2.5 rounded-2xl mr-3">
            <Bot size={24} className="text-slate-900" />
        </div>
        <div>
            <h2 className="font-black text-white text-lg tracking-tight uppercase italic">Coach Riffson</h2>
            <p className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Prêt à jouer</p>
        </div>
        {/* Repartir de zéro : l'historique envoyé au modèle redevient léger */}
        <button
          onClick={() => setMessages([welcomeMessage(user.name)])}
          disabled={isLoading || messages.length <= 1}
          className="ml-auto flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-amber-400 disabled:opacity-40 disabled:hover:text-slate-400 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2"
        >
          <MessageSquarePlus size={16} /> Nouvelle conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
            <div className={`max-w-[92%] p-5 rounded-3xl shadow-xl ${msg.role === 'user' ? 'bg-amber-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'}`}>
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown components={{
                      p: ({ children }) => {
                          if (typeof children === 'string') {
                              const text = children.trim();
                              if (text.startsWith('[RIFF:')) {
                                  const riffData = parseRiffTag(text);
                                  if (riffData) return <RiffPlayer {...riffData} />;
                              }
                              if (/^\[ACCORDS:/i.test(text)) {
                                  const progression = parseChordsTag(text);
                                  if (progression) return <ChordProgressionPlayer {...progression} />;
                              }
                              if (text.match(/^\[([a-zA-Z0-9#]+)\]$/)) {
                                  return <ChordDiagram chordName={text} />;
                              }
                          }
                          return <p className="leading-relaxed mb-4 last:mb-0 text-base">{children}</p>;
                      }
                  }}>{msg.text}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
            <div className="flex justify-start animate-pulse">
                <div className="bg-slate-800 p-4 rounded-3xl border border-slate-700 flex items-center gap-3">
                    <Loader2 size={18} className="animate-spin text-amber-500" />
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Riffson prépare sa démo...</span>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <div className="p-4 bg-slate-950 border-t border-slate-800 flex gap-2 items-center pb-8">
          <input 
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
            placeholder="Demandez un riff à Riffson..." 
            className="flex-1 bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white focus:ring-2 focus:ring-amber-500 outline-none"
          />
          <button onClick={() => handleSend()} className="bg-amber-500 text-slate-900 rounded-2xl p-4 shadow-lg shadow-amber-500/20">
            <Send size={24} />
          </button>
      </div>
    </div>
  );
};

export default ChatTutor;
