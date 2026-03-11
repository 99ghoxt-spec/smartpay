import { Timestamp } from 'firebase/firestore';

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: Timestamp;
  description: string;
  createdAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}

export const CATEGORIES = [
  "餐饮美食", "交通出行", "购物消费", "休闲娱乐", "医疗保健", 
  "生活日用", "住房缴费", "工资收入", "理财收益", "其他"
];
