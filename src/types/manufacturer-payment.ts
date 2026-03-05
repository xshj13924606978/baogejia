export interface ManufacturerPayment {
  id: number;
  manufacturer_id?: string;
  manufacturer_name: string;
  total_amount: number;
  order_count: number;
  avg_amount?: number;
  category?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  payment_date?: string;
}

export interface ManufacturerPaymentSummary {
  total_amount: number;
  total_orders: number;
  avg_amount: number;
}

export interface ManufacturerPaymentResponse {
  success: boolean;
  data: {
    rankings: ManufacturerPayment[];
    summary: ManufacturerPaymentSummary;
  };
  error?: string;
  message?: string;
}

export interface ManufacturerPaymentFilters {
  category?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
}
