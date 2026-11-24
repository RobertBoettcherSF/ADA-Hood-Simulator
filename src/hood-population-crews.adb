with Hood.Population.Transport;
package body Hood.Population.Crews is

   function Slot_Of (S : Population_State; Id : Integer_32) return Integer_32 is
   begin
      if Id = No_Id then
         return No_Id;
      end if;
      for K in S.Crews'Range loop
         if S.Crews (K).Gang /= 0 and then S.Crews (K).Id = Id then
            return K;
         end if;
      end loop;
      return No_Id;
   end Slot_Of;

   function In_Pool (S : Population_State; G : Gang_Id; Person : Integer_32) return Boolean is
   begin
      for K in 1 .. Integer (S.Gangs (G).Pool_Count) loop
         if S.Gangs (G).Pool (K) = Person then
            return True;
         end if;
      end loop;
      return False;
   end In_Pool;

   procedure Join_Pool (S : in out Population_State; G : Gang_Id; Person : Integer_32) is
   begin
      if not In_Pool (S, G, Person) and then S.Gangs (G).Pool_Count < Max_Pool then
         S.Gangs (G).Pool_Count := S.Gangs (G).Pool_Count + 1;
         S.Gangs (G).Pool (Integer (S.Gangs (G).Pool_Count)) := Person;
      end if;
   end Join_Pool;

   procedure Leave_Pool (S : in out Population_State; G : Gang_Id; Person : Integer_32) is
      N : Integer_32 := 0;
      Gang : Gang_Rec renames S.Gangs (G);
   begin
      for K in 1 .. Integer (Gang.Pool_Count) loop
         if Gang.Pool (K) /= Person then
            N := N + 1;
            Gang.Pool (Integer (N)) := Gang.Pool (K);
         end if;
      end loop;
      Gang.Pool_Count := N;
   end Leave_Pool;

   procedure Add_Member (S : in out Population_State; Slot, Person : Integer_32) is
      Crew : Crew_Rec renames S.Crews (Slot);
   begin
      Crew.Count := Crew.Count + 1;
      Crew.Members (Integer (Crew.Count)) := Person;
      S.People (Person).Team := Crew.Id;
   end Add_Member;

   procedure Remove_Member (S : in out Population_State; Slot, Person : Integer_32) is
      Crew : Crew_Rec renames S.Crews (Slot);
      N : Integer_32 := 0;
   begin
      for K in 1 .. Integer (Crew.Count) loop
         if Crew.Members (K) /= Person then
            N := N + 1;
            Crew.Members (Integer (N)) := Crew.Members (K);
         end if;
      end loop;
      Crew.Count := N;
   end Remove_Member;

   procedure Leave_Everything (S : in out Population_State; G : Gang_Id; Person : Integer_32) is
   begin
      for K in 1 .. Integer (S.Gangs (G).Crew_Total) loop
         Remove_Member (S, S.Gangs (G).Crews (K), Person);
      end loop;
      Leave_Pool (S, G, Person);
   end Leave_Everything;

   procedure New_Crew
     (S : in out Population_State; G : Gang_Id; Lieutenant : Integer_32;
      Slot : out Integer_32) is
   begin
      Slot := No_Id;
      if S.Gangs (G).Crew_Total >= Max_Gang_Crews then
         return;
      end if;
      for K in S.Crews'Range loop
         if S.Crews (K).Gang = 0 then
            Slot := K;
            exit;
         end if;
      end loop;
      if Slot = No_Id then
         return;
      end if;
      Leave_Everything (S, G, Lieutenant);
      S.Crews (Slot) := (Id => S.Next_Id, Gang => G, Lieutenant => Lieutenant,
                         Name_First => Integer_32 (S.People (Lieutenant).First),
                         Count | Pistols | Coupes | Speedsters | Trucks | Order_Count | Time_Used => 0,
                         Members => [others => No_Id], Orders => [others => No_Id]);
      S.Next_Id := S.Next_Id + 1;
      S.Gangs (G).Crew_Total := S.Gangs (G).Crew_Total + 1;
      S.Gangs (G).Crews (Integer (S.Gangs (G).Crew_Total)) := Slot;
      S.People (Lieutenant).Kind := R_Lieutenant;
      S.People (Lieutenant).Team := S.Crews (Slot).Id;
   end New_Crew;

   procedure Disband
     (S : in out Population_State; Slot : Integer_32; Keep_Lieutenant : Boolean)
   is
      Crew : Crew_Rec renames S.Crews (Slot);
      G    : constant Gang_Id := Crew.Gang;
      N    : Integer_32 := 0;
   begin
      Hood.Population.Transport.Drop_Crew (S, Slot);
      S.Gangs (G).Coupes := S.Gangs (G).Coupes + Crew.Coupes;
      S.Gangs (G).Speedsters := S.Gangs (G).Speedsters + Crew.Speedsters;
      S.Gangs (G).Trucks := S.Gangs (G).Trucks + Crew.Trucks;
      S.Gangs (G).Pistols := S.Gangs (G).Pistols + Crew.Pistols;
      for K in 1 .. Integer (Crew.Order_Count) loop
         declare
            O : Order_Rec renames S.Orders (Crew.Orders (K));
         begin
            for J in 1 .. Integer (O.Assigned_Count) loop
               S.People (O.Assigned (J)).Order := No_Id;
            end loop;
            O.Gang := 0;
         end;
      end loop;
      for K in 1 .. Integer (Crew.Count) loop
         if S.People (Crew.Members (K)).Status /= Dead then
            S.People (Crew.Members (K)).Team := No_Id;
            Join_Pool (S, G, Crew.Members (K));
         end if;
      end loop;
      if Crew.Lieutenant /= No_Id then
         S.People (Crew.Lieutenant).Team := No_Id;
         if Keep_Lieutenant and then S.People (Crew.Lieutenant).Status /= Dead then
            S.People (Crew.Lieutenant).Kind := R_Hood;
            Join_Pool (S, G, Crew.Lieutenant);
         end if;
      end if;
      for K in 1 .. Integer (S.Gangs (G).Crew_Total) loop
         if S.Gangs (G).Crews (K) /= Slot then
            N := N + 1;
            S.Gangs (G).Crews (Integer (N)) := S.Gangs (G).Crews (K);
         end if;
      end loop;
      S.Gangs (G).Crew_Total := N;
      Crew.Gang := 0;
      Crew.Count := 0;
      Crew.Order_Count := 0;
   end Disband;

end Hood.Population.Crews;
