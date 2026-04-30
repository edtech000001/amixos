import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createSupabaseClient } from '@/lib/supabase';
import { useApp } from '@/lib/AppContext';
import {
  EmployeesScreen,
  type EmployeeListItem,
  type TimesheetListItem,
} from '@amixos/shared/screens/dashboard/EmployeesScreen';

interface RawEmployee {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: string;
  pay_type: string;
  pay_rate: number;
  active: boolean;
}
interface RawTimesheet {
  id: string;
  worker_name: string | null;
  work_date: string;
  hours_worked: number | null;
  job_description: string | null;
  employee_id: string | null;
}

export default function EmpleadosRoute() {
  const supabase = createSupabaseClient();
  const { business } = useApp();
  const [employees, setEmployees] = useState<RawEmployee[]>([]);
  const [timesheets, setTimesheets] = useState<RawTimesheet[]>([]);

  useEffect(() => {
    if (!business) return;
    supabase.from('employees').select('*').eq('business_id', business.id).order('first_name')
      .then(({ data }) => setEmployees(data ?? []));
    supabase.from('timesheets').select('*').eq('business_id', business.id)
      .order('work_date', { ascending: false }).limit(50)
      .then(({ data }) => setTimesheets(data ?? []));
  }, [business]);

  const empList: EmployeeListItem[] = useMemo(() => employees.map(e => ({
    id: e.id,
    firstName: e.first_name,
    lastName: e.last_name,
    phone: e.phone,
    role: e.role,
    payType: e.pay_type,
    payRate: e.pay_rate,
    active: e.active,
  })), [employees]);

  const tsList: TimesheetListItem[] = useMemo(() => timesheets.map(ts => ({
    id: ts.id,
    workerName: ts.worker_name,
    workDate: ts.work_date,
    hoursWorked: ts.hours_worked,
    jobDescription: ts.job_description,
    employeeId: ts.employee_id,
  })), [timesheets]);

  const toggleActive = async (id: string) => {
    const e = employees.find(emp => emp.id === id);
    if (!e) return;
    await supabase.from('employees').update({ active: !e.active }).eq('id', e.id);
    setEmployees(prev => prev.map(emp => (emp.id === e.id ? { ...emp, active: !e.active } : emp)));
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      <EmployeesScreen
        employees={empList}
        timesheets={tsList}
        onAddEmployee={() => Alert.alert('Coming soon', 'Add employee from mobile not yet built')}
        onEditEmployee={() => Alert.alert('Coming soon', 'Edit employee from mobile not yet built')}
        onToggleActive={toggleActive}
        onLogHours={() => Alert.alert('Coming soon', 'Log hours from mobile not yet built')}
      />
    </SafeAreaView>
  );
}
