'use client'
import apiClient from "./apiclient"

const fetchExpensesAPI = async () => {
    const response = await apiClient.get("/expenses")
    return response
}

const addExpensesAPI = async (name: string, amount: number, category: string) => {
    const response = await apiClient.post("/expenses", {
        name,
        amount,
        category
    })
    return response
}

const deleteExpenseAPI = async (id: string) => {
    const response = await apiClient.delete(`/expenses/${id}`)
    return response
}

const updateExpenseAPI = async (id: string, name: string, amount: number, category: string) => {
    const response = await apiClient.put(`/expenses/${id}`, {
        name,
        amount,
        category
    })
    return response
}

export { fetchExpensesAPI, addExpensesAPI, deleteExpenseAPI, updateExpenseAPI }
