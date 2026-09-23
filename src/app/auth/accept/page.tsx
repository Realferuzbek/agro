import type { Metadata } from 'next';
import { AuthAccept } from '@/components/auth-accept';

export const metadata:Metadata={title:'Account setup',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function Page(){return <AuthAccept/>;}
