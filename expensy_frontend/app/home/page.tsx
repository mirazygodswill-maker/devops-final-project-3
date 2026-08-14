"use client"

import { useState, useMemo, useEffect, ChangeEvent } from "react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table"
import { ChartTooltipContent, ChartTooltip, ChartContainer } from "@/components/ui/chart"
import { Pie, PieChart, Cell } from "recharts"
import { addExpensesAPI, fetchExpensesAPI, deleteExpenseAPI, updateExpenseAPI } from "@/api/expensesapi"

interface Expense {
  id: string
  name: string
  amount: number
  category: string
}

interface NewExpense {
  name: string
  amount: string
  category: string
}

const generateRandomColor = () => {
  const letters = "0123456789ABCDEF"
  let color = "#"
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)]
  }
  return color
}

export default function Component() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [newExpense, setNewExpense] = useState<NewExpense>({
    name: "",
    amount: "",
    category: "",
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<NewExpense>({ name: "", amount: "", category: "" })

  const loadExpenses = async () => {
    try {
      const response = await fetchExpensesAPI()
      const mapped = response.data.map((e: any) => ({
        id: e._id,
        name: e.name,
        amount: e.amount,
        category: e.category,
      }))
      setExpenses(mapped)
    } catch (error) {
      console.error("Error fetching expenses:", error)
    }
  }

  useEffect(() => {
    loadExpenses()
  }, [])

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setNewExpense({
      ...newExpense,
      [e.target.id]: e.target.value,
    })
  }

  const handleAddExpense = async () => {
    if (newExpense.name && newExpense.amount && newExpense.category) {
      try {
        await addExpensesAPI(newExpense.name, parseFloat(newExpense.amount), newExpense.category)
        setNewExpense({ name: "", amount: "", category: "" })
        await loadExpenses()
      } catch (error) {
        console.error("Error adding expense:", error)
      }
    }
  }

  const handleDeleteExpense = async (id: string) => {
    try {
      await deleteExpenseAPI(id)
      await loadExpenses()
    } catch (error) {
      console.error("Error deleting expense:", error)
    }
  }

  const startEditing = (expense: Expense) => {
    setEditingId(expense.id)
    setEditValues({
      name: expense.name,
      amount: String(expense.amount),
      category: expense.category,
    })
  }

  const cancelEditing = () => {
    setEditingId(null)
    setEditValues({ name: "", amount: "", category: "" })
  }

  const handleEditInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEditValues({
      ...editValues,
      [e.target.id]: e.target.value,
    })
  }

  const saveEdit = async (id: string) => {
    if (editValues.name && editValues.amount && editValues.category) {
      try {
        await updateExpenseAPI(id, editValues.name, parseFloat(editValues.amount), editValues.category)
        setEditingId(null)
        await loadExpenses()
      } catch (error) {
        console.error("Error updating expense:", error)
      }
    }
  }

  const expensesByCategory = useMemo(() => {
    return expenses.reduce<{ [key: string]: { name: string; amount: number } }>((acc, expense) => {
      if (!acc[expense.category]) {
        acc[expense.category] = {
          name: expense.category,
          amount: 0,
        }
      }
      acc[expense.category].amount += expense.amount
      return acc
    }, {})
  }, [expenses])

  const categoriesData = useMemo(() => {
    return Object.values(expensesByCategory)
  }, [expensesByCategory])

  const categoryColors = useMemo(() => {
    const colors: { [key: string]: string } = {}
    categoriesData.forEach((category) => {
      colors[category.name] = generateRandomColor()
    })
    return colors
  }, [categoriesData])

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle>Add Expense</CardTitle>
          <CardDescription>Enter your expense details to track your spending.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Expense Name</Label>
              <Input id="name" placeholder="Enter expense name" value={newExpense.name} onChange={handleInputChange} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={newExpense.amount}
                onChange={handleInputChange}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={newExpense.category}
              onValueChange={(value) => setNewExpense({ ...newExpense, category: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Housing">Housing</SelectItem>
                <SelectItem value="Food">Food</SelectItem>
                <SelectItem value="Transportation">Transportation</SelectItem>
                <SelectItem value="Utilities">Utilities</SelectItem>
                <SelectItem value="Entertainment">Entertainment</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleAddExpense}>Add Expense</Button>
        </CardFooter>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
          <CardDescription>View and manage your recorded expenses.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Expense</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  {editingId === expense.id ? (
                    <>
                      <TableCell>
                        <Input id="name" value={editValues.name} onChange={handleEditInputChange} />
                      </TableCell>
                      <TableCell>
                        <Input id="amount" type="number" value={editValues.amount} onChange={handleEditInputChange} />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={editValues.category}
                          onValueChange={(value) => setEditValues({ ...editValues, category: value })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Housing">Housing</SelectItem>
                            <SelectItem value="Food">Food</SelectItem>
                            <SelectItem value="Transportation">Transportation</SelectItem>
                            <SelectItem value="Utilities">Utilities</SelectItem>
                            <SelectItem value="Entertainment">Entertainment</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" onClick={() => saveEdit(expense.id)}>Save</Button>
                        <Button size="sm" variant="outline" onClick={cancelEditing}>Cancel</Button>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-medium">{expense.name}</TableCell>
                      <TableCell className="text-right">${expense.amount}</TableCell>
                      <TableCell>{expense.category}</TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="outline" onClick={() => startEditing(expense)}>Edit</Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteExpense(expense.id)}>Delete</Button>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Expense Breakdown</CardTitle>
          <CardDescription>Visualize your expenses by category.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <PiechartcustomChart  data={categoriesData} categoryColors={categoryColors} />
            </div>
            <div className="space-y-4">
              {categoriesData.map((category) => (
                <div key={category.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: categoryColors[category.name] }} />
                    <span>{category.name}</span>
                  </div>
                  <span className="font-medium">${category.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PiechartcustomChart({ data, categoryColors, ...props }: { data: { name: string; amount: number }[]; categoryColors: { [key: string]: string } }) {
  return (
    <div {...props}>
      <ChartContainer
        config={
            {

            }
        }

      >
        <PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="amount" nameKey="name">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={categoryColors[entry.name]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
    </div>
  )
}
