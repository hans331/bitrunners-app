import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';

interface Member {
  id: string;
  name: string;
}

export default function App() {
  const [member, setMember] = useState<Member | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('selectedMember')
      .then((json) => {
        if (json) {
          setMember(JSON.parse(json));
        }
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      {member ? (
        <HomeScreen member={member} onLogout={() => setMember(null)} />
      ) : (
        <LoginScreen onLogin={(m) => setMember(m)} />
      )}
    </>
  );
}
